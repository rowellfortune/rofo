import { DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import type { Caller } from '../utils/GraphqlUtil';
import { ddb, TABLE } from './db';
import { stripKeys } from './keys';

/*
 * Agent applications (same table, Single Table Design):
 *   pk=APPLICATION#<userId>  sk=META   one application per user
 *   gsi2pk=APPS#<STATUS>     gsi2sk=<createdAt>#<userId>   the admin queue, one list per status
 * Status moves PENDING -> APPROVED or REJECTED. An approved agent can later be REVOKED.
 * A rejected or revoked user may apply again.
 *
 * Revocation also writes a marker item  pk=REVOKED#<userId>.
 * Why: after the Cognito group is removed, the user's existing token still says "Agent" until it expires (up to an hour),
 * and AppSync trusts the token. The Lambda checks the marker, so a revoked agent is blocked at once.
 */

export type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

/** What the handler injects. Tests replace it. */
export interface ApplicationDeps {
  /** Add a user to the Agent group in Cognito. */
  addToAgentGroup: (userId: string) => Promise<void>;
  /** Remove a user from the Agent group and end their sessions. */
  removeFromAgentGroup: (userId: string) => Promise<void>;
  /** Hide all of an agent's listings from the public. */
  hideListings: (userId: string) => Promise<{ changed: number; failed: number }>;
  /** Show listings that revocation hid. Listings hidden for any other reason stay hidden. */
  restoreListings: (userId: string) => Promise<{ changed: number; failed: number }>;
  now: () => Date;
}

const Input = z.object({
  name: z.string().trim().min(2).max(100),
  agency: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(5).max(30),
  registrationNo: z.string().trim().min(3).max(60), // business registration or agent licence number
  country: z.string().trim().min(2).max(80),
  website: z.string().trim().max(200).nullish()
    .refine((v) => !v || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), 'Website must start with http:// or https://'),
  about: z.string().trim().min(20).max(1500),
});

const key = (userId: string) => ({ pk: `APPLICATION#${userId}`, sk: 'META' });
const queueKeys = (status: Status, createdAt: string, userId: string) => ({ gsi2pk: `APPS#${status}`, gsi2sk: `${createdAt}#${userId}` });
const revokedKey = (userId: string) => ({ pk: `REVOKED#${userId}`, sk: 'META' });
const isConflict = (e: unknown) => (e as { name?: string })?.name === 'ConditionalCheckFailedException';

/** The caller's own application, or null if they never applied. */
export async function myApplication(caller: Caller) {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key(caller.sub) }));
  return res.Item ? stripKeys(res.Item) : null;
}

/**
 * Submit or resubmit. Allowed when there is no application, or the last one was rejected.
 * The condition makes a double click or a race safe: only one write can win.
 */
export async function submitApplication(caller: Caller, raw: unknown, deps: Pick<ApplicationDeps, 'now'>) {
  if (caller.groups.includes('Agent') || caller.groups.includes('Admin')) throw new AppError('You already have agent access', 400);
  const r = Input.safeParse(raw);
  if (!r.success) throw new AppError(r.error.issues.map((i) => `${i.path.join('.') || 'application'}: ${i.message}`).join('; '), 400);

  const now = deps.now().toISOString();
  const prev = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key(caller.sub) }));
  const wasRevoked = prev.Item?.status === 'REVOKED';
  const item = {
    ...key(caller.sub), ...queueKeys('PENDING', now, caller.sub), entity: 'AGENT_APPLICATION',
    userId: caller.sub, email: caller.email, ...r.data, website: r.data.website || null,
    status: 'PENDING' as Status, reviewNote: null, reviewedAt: null,
    // Keep the reason for an earlier revocation in front of whoever reviews this new application.
    priorRevocationNote: wasRevoked ? (prev.Item?.reviewNote ?? null) : (prev.Item?.priorRevocationNote ?? null),
    priorRevocationAt: wasRevoked ? (prev.Item?.reviewedAt ?? null) : (prev.Item?.priorRevocationAt ?? null),
    createdAt: (prev.Item?.createdAt as string | undefined) ?? now, updatedAt: now,
  };
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE(), Item: item,
      ConditionExpression: 'attribute_not_exists(pk) OR #status = :rejected OR #status = :revoked',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':rejected': 'REJECTED', ':revoked': 'REVOKED' },
    }));
  } catch (e) {
    if (isConflict(e)) throw new AppError('You already have an application in review or approved', 409);
    throw e;
  }
  return stripKeys(item);
}

/** Admin queue for one status, newest first. */
export async function listApplications(caller: Caller, status: Status) {
  if (!caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE(), IndexName: 'gsi2', KeyConditionExpression: 'gsi2pk = :pk',
    ExpressionAttributeValues: { ':pk': `APPS#${status}` }, ScanIndexForward: false, Limit: 50,
  }));
  return (res.Items ?? []).map(stripKeys);
}

/**
 * Approve or reject a pending application. Admin only.
 * Order matters: first claim the decision with a conditional update (so two admins cannot both act),
 * then change the Cognito group. If the group change fails the claim is undone, so nobody ends up
 * "approved" in the table without agent access.
 */
export async function reviewApplication(
  caller: Caller, userId: string, decision: 'APPROVED' | 'REJECTED', note: string | null | undefined, deps: ApplicationDeps,
) {
  if (!caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
  if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new AppError('Decision must be APPROVED or REJECTED', 400);
  const cleanNote = (note ?? '').trim().slice(0, 500);
  if (decision === 'REJECTED' && cleanNote.length < 5) throw new AppError('Give a short reason so the applicant knows what to fix', 400);

  const current = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key(userId) }));
  if (!current.Item) throw new AppError('Application not found', 404);
  const createdAt = current.Item.createdAt as string;
  const at = deps.now().toISOString();

  const setStatus = (to: Status, from: Status, extra: Record<string, unknown>) => ddb.send(new UpdateCommand({
    TableName: TABLE(), Key: key(userId),
    UpdateExpression: 'SET #status = :to, gsi2pk = :g, reviewedAt = :at, reviewedBy = :by, reviewNote = :note, updatedAt = :at',
    ConditionExpression: '#status = :from',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':to': to, ':from': from, ':g': queueKeys(to, createdAt, userId).gsi2pk, ':at': at, ':by': caller.sub, ':note': extra.note ?? null },
    ReturnValues: 'ALL_NEW',
  }));

  let claimed;
  try { claimed = await setStatus(decision, 'PENDING', { note: cleanNote || null }); }
  catch (e) {
    if (isConflict(e)) throw new AppError('This application was already reviewed', 409);
    throw e;
  }

  if (decision === 'APPROVED') {
    // A re-approved agent must not stay blocked by an old revocation. Clear the marker first.
    // If granting the group then fails we put the application back to pending, and with no Agent group the marker is not needed.
    await ddb.send(new DeleteCommand({ TableName: TABLE(), Key: revokedKey(userId) }));
    try { await deps.addToAgentGroup(userId); }
    catch (e) {
      console.error('Could not add user to Agent group', userId, (e as Error).message);
      await setStatus('PENDING', 'APPROVED', { note: null }).catch(() => {}); // undo the claim
      throw new AppError('Could not grant agent access. The application is still pending. Try again.', 502);
    }
    // Bring back the listings revocation hid. Failures are logged. They do not undo the approval.
    const back = await deps.restoreListings(userId).catch((e: Error) => { console.error('Could not restore listings', userId, e.message); return { changed: 0, failed: -1 }; });
    if (back.failed !== 0) console.error('Some listings were not restored', userId, back);
  }
  return stripKeys(claimed.Attributes ?? current.Item);
}

/**
 * Take agent access away. Admin only. Steps, in order:
 *  1. In one transaction: mark the application REVOKED (only if it is APPROVED) and write the block marker.
 *  2. Remove the Cognito Agent group and end the user's sessions. If that fails, step 1 is undone.
 *  3. Optionally hide the agent's listings. Failures here do not undo the revocation, the counts are returned.
 * The block marker stops the user at once even though their old token still lists the Agent group.
 */
export async function revokeAgent(
  caller: Caller, userId: string, reason: string, hideListings: boolean, deps: ApplicationDeps,
) {
  if (!caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
  if (userId === caller.sub) throw new AppError('You cannot revoke your own access', 400);
  const why = (reason ?? '').trim().slice(0, 500);
  if (why.length < 5) throw new AppError('Give a short reason. It is shown to the person and to admins later.', 400);

  const current = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key(userId) }));
  if (!current.Item) throw new AppError('No application found for this user. If they were added by hand, remove them from the Agent group in Cognito.', 404);
  if (current.Item.status === 'REVOKED') throw new AppError('Access was already revoked', 409);
  if (current.Item.status !== 'APPROVED') throw new AppError('Only an approved agent can be revoked', 400);

  const createdAt = current.Item.createdAt as string;
  const at = deps.now().toISOString();
  const claim = (to: Status, from: Status, note: string | null) => ({
    Update: {
      TableName: TABLE(), Key: key(userId),
      UpdateExpression: 'SET #status = :to, gsi2pk = :g, reviewedAt = :at, reviewedBy = :by, reviewNote = :note, updatedAt = :at',
      ConditionExpression: '#status = :from',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':to': to, ':from': from, ':g': queueKeys(to, createdAt, userId).gsi2pk, ':at': at, ':by': caller.sub, ':note': note },
    },
  });

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        claim('REVOKED', 'APPROVED', why),
        { Put: { TableName: TABLE(), Item: { ...revokedKey(userId), entity: 'AGENT_REVOKED', userId, revokedAt: at, revokedBy: caller.sub, reason: why } } },
      ],
    }));
  } catch (e) {
    if ((e as { name?: string })?.name === 'TransactionCanceledException') throw new AppError('This agent was already revoked or changed. Refresh and check.', 409);
    throw e;
  }

  try { await deps.removeFromAgentGroup(userId); }
  catch (e) {
    console.error('Could not remove user from Agent group', userId, (e as Error).message);
    // Undo: back to APPROVED, drop the marker. The user keeps access, so the record must say so.
    await ddb.send(new TransactWriteCommand({
      TransactItems: [claim('APPROVED', 'REVOKED', current.Item.reviewNote ?? null), { Delete: { TableName: TABLE(), Key: revokedKey(userId) } }],
    })).catch((err: Error) => console.error('Could not undo the revocation', userId, err.message));
    throw new AppError('Could not remove agent access. Nothing was changed. Try again.', 502);
  }

  let hidden = { changed: 0, failed: 0 };
  if (hideListings) {
    hidden = await deps.hideListings(userId).catch((e: Error) => { console.error('Could not hide listings', userId, e.message); return { changed: 0, failed: -1 }; });
  }
  const after = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key(userId) }));
  return { ...stripKeys(after.Item ?? current.Item), listingsHidden: hidden.changed, listingsFailed: hidden.failed };
}

/**
 * Block a revoked agent right away, whatever their token says. Admins are never blocked.
 * One cheap read. Call it on every agent only action.
 */
export async function assertActiveAgent(caller: Caller): Promise<void> {
  return assertNotRevoked(caller.sub, caller.groups);
}

/** Same check for code that only has a user id and groups (the REST upload endpoint). */
export async function assertNotRevoked(userId: string, groups: string[]): Promise<void> {
  if (groups.includes('Admin')) return;
  const hit = await ddb.send(new GetCommand({ TableName: TABLE(), Key: revokedKey(userId) }));
  if (hit.Item) throw new AppError('Agent access was revoked', 403);
}
