import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import type { Caller } from '../utils/GraphqlUtil';
import { ddb, TABLE } from './db';
import { stripKeys } from './keys';

/*
 * Agent applications (same table, Single Table Design):
 *   pk=APPLICATION#<userId>  sk=META   one application per user
 *   gsi2pk=APPS#<STATUS>     gsi2sk=<createdAt>#<userId>   the admin queue, one list per status
 * Status moves PENDING -> APPROVED or REJECTED. A rejected user may apply again.
 */

export type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

/** What the handler injects. Tests replace it. */
export interface ApplicationDeps {
  /** Add a user to the Agent group in Cognito. */
  addToAgentGroup: (userId: string) => Promise<void>;
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
  const item = {
    ...key(caller.sub), ...queueKeys('PENDING', now, caller.sub), entity: 'AGENT_APPLICATION',
    userId: caller.sub, email: caller.email, ...r.data, website: r.data.website || null,
    status: 'PENDING' as Status, reviewNote: null, reviewedAt: null,
    createdAt: (prev.Item?.createdAt as string | undefined) ?? now, updatedAt: now,
  };
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE(), Item: item,
      ConditionExpression: 'attribute_not_exists(pk) OR #status = :rejected',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':rejected': 'REJECTED' },
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
    try { await deps.addToAgentGroup(userId); }
    catch (e) {
      console.error('Could not add user to Agent group', userId, (e as Error).message);
      await setStatus('PENDING', 'APPROVED', { note: null }).catch(() => {}); // undo the claim
      throw new AppError('Could not grant agent access. The application is still pending. Try again.', 502);
    }
  }
  return stripKeys(claimed.Attributes ?? current.Item);
}
