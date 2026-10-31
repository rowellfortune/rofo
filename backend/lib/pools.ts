import { randomUUID } from 'node:crypto';
import {
  BatchGetCommand, GetCommand, QueryCommand, TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { goalAmount, quorum } from '../../src/lib/pools';
import { AppError } from '../utils/AppError';
import type { Caller } from '../utils/GraphqlUtil';
import { ddb, TABLE } from './db';
import { memberIndexKeys, memberKey, poolIndexKeys, poolKey, stripKeys } from './keys';
import { decodeToken, encodeToken, loadListing } from './listings';

/*
 * Pool items (same table, Single Table Design):
 *   META      pk=POOL#<id>  sk=META                      pool terms and running totals
 *   MEMBER    pk=POOL#<id>  sk=MEMBER#<userId>           one per member, gsi3 = MEMBER#<userId>
 *   LEDGER    pk=POOL#<id>  sk=LEDGER#<iso>#<uuid>       confirmed payments (append only)
 *   PROPOSAL  pk=POOL#<id>  sk=PROP#<id>
 *   VOTE      pk=POOL#<id>  sk=VOTE#<proposalId>#<userId>  one per member per proposal
 * Reading a whole pool is ONE Query on pk=POOL#<id>.
 */

type Item = Record<string, any>;

const CreatePool = z.object({
  name: z.string().trim().min(3).max(60),
  listingId: z.string().uuid(),
  maxMembers: z.number().int().min(2).max(12),
  targetMonths: z.number().int().min(6).max(60),
  monthly: z.number().positive().max(1_000_000),
});

const ProposalInput = z.object({
  title: z.string().trim().min(5).max(120),
  detail: z.string().trim().max(1000).default(''),
});

/** DynamoDB transaction failures mean a condition did not hold (full pool, double join, etc). */
const isConflict = (err: unknown) => (err as { name?: string })?.name === 'TransactionCanceledException';

/** Pool status is derived, never stored, so it cannot drift from the totals. */
function statusOf(p: Item): 'FORMING' | 'SAVING' | 'READY' | 'CLOSED' {
  if (p.closed) return 'CLOSED';
  if (p.raised >= p.goal) return 'READY';
  return p.memberCount < p.maxMembers ? 'FORMING' : 'SAVING';
}

/** Public shape of a pool without member data. */
function summary(p: Item) {
  return {
    id: p.id, name: p.name, listingId: p.listingId, listingPrice: p.listingPrice,
    goal: p.goal, raised: p.raised, maxMembers: p.maxMembers, memberCount: p.memberCount,
    targetMonths: p.targetMonths, status: statusOf(p), creatorId: p.creatorId, createdAt: p.createdAt,
    viewerIsMember: null as boolean | null,
    members: [] as unknown[], ledger: [] as unknown[], proposals: [] as unknown[],
  };
}

/** Run a Query on one partition until exhausted (pools are small, capped at 10 pages). */
async function queryPartition(pk: string): Promise<Item[]> {
  const out: Item[] = [];
  let key: Record<string, unknown> | undefined;
  for (let i = 0; i < 10; i++) {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE(), KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk }, ExclusiveStartKey: key,
    }));
    out.push(...(res.Items ?? []));
    key = res.LastEvaluatedKey;
    if (!key) break;
  }
  return out;
}

async function loadPool(id: string): Promise<Item> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: poolKey(id) }));
  if (!res.Item) throw new AppError('Pool not found', 404);
  return res.Item;
}

async function loadMember(poolId: string, userId: string): Promise<Item | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: memberKey(poolId, userId) }));
  return res.Item;
}

/** Create a pool for a for-sale listing. The creator becomes the first member. */
export async function createPool(caller: Caller, raw: unknown) {
  const r = CreatePool.safeParse(raw);
  if (!r.success) throw new AppError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  const input = r.data;

  const listing = await loadListing(input.listingId);
  if (listing.deal !== 'buy') throw new AppError('Pools are for homes for sale', 400);
  if (listing.suspended) throw new AppError('Listing not found', 404); // hidden listings cannot start pools

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const meta = {
    id, name: input.name, listingId: input.listingId, listingPrice: listing.price as number,
    goal: goalAmount(listing.price as number), raised: 0, maxMembers: input.maxMembers,
    memberCount: 1, targetMonths: input.targetMonths, creatorId: caller.sub, createdAt,
  };
  const member = {
    poolId: id, userId: caller.sub, name: caller.name, monthly: input.monthly, contributed: 0,
    joinedAt: createdAt,
  };

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: TABLE(), Item: { ...poolKey(id), ...poolIndexKeys(meta), entity: 'POOL', ...meta }, ConditionExpression: 'attribute_not_exists(pk)' } },
      { Put: { TableName: TABLE(), Item: { ...memberKey(id, caller.sub), ...memberIndexKeys(caller.sub, createdAt, id), entity: 'POOL_MEMBER', ...member } } },
    ],
  }));
  return summary(meta);
}

/**
 * Join a pool. One transaction does both writes, so two people cannot take
 * the last seat and nobody can join twice.
 */
export async function joinPool(caller: Caller, poolId: string, monthly: unknown) {
  const amount = z.number().positive().max(1_000_000).safeParse(monthly);
  if (!amount.success) throw new AppError('Invalid monthly amount', 400);
  const pool = await loadPool(poolId);
  if (pool.closed) throw new AppError('Pool is closed', 400);

  const joinedAt = new Date().toISOString();
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        { Put: {
          TableName: TABLE(),
          Item: {
            ...memberKey(poolId, caller.sub), ...memberIndexKeys(caller.sub, pool.createdAt, poolId),
            entity: 'POOL_MEMBER', poolId, userId: caller.sub, name: caller.name,
            monthly: amount.data, contributed: 0, joinedAt,
          },
          ConditionExpression: 'attribute_not_exists(pk)', // not already a member
        } },
        { Update: {
          TableName: TABLE(), Key: poolKey(poolId),
          UpdateExpression: 'SET memberCount = memberCount + :one',
          ConditionExpression: 'attribute_not_exists(closed) AND memberCount < maxMembers',
          ExpressionAttributeValues: { ':one': 1 },
        } },
      ],
    }));
  } catch (err) {
    if (isConflict(err)) throw new AppError('Pool is full, closed, or you already joined', 409);
    throw err;
  }
  return true;
}

/** Leave a pool. Only allowed before paying in. The creator cannot leave. */
export async function leavePool(caller: Caller, poolId: string) {
  const pool = await loadPool(poolId);
  if (pool.creatorId === caller.sub) throw new AppError('The creator cannot leave. Close the pool instead.', 400);
  const me = await loadMember(poolId, caller.sub);
  if (!me) throw new AppError('You are not in this pool', 404);
  if (me.contributed > 0) throw new AppError('You have paid in. Exit follows the co-ownership agreement.', 400);

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: TABLE(), Key: memberKey(poolId, caller.sub), ConditionExpression: 'contributed = :zero', ExpressionAttributeValues: { ':zero': 0 } } },
        { Update: { TableName: TABLE(), Key: poolKey(poolId), UpdateExpression: 'SET memberCount = memberCount - :one', ConditionExpression: 'memberCount > :one', ExpressionAttributeValues: { ':one': 1 } } },
      ],
    }));
  } catch (err) {
    if (isConflict(err)) throw new AppError('Could not leave. Try again.', 409);
    throw err;
  }
  return true;
}

/** Cancellation reasons DynamoDB attaches to a failed transaction, one per item, in order. */
const reasons = (err: unknown): { Code?: string }[] => (err as { CancellationReasons?: { Code?: string }[] })?.CancellationReasons ?? [];

const Payment = z.object({
  amount: z.number().positive().max(10_000_000),
  // Escrow receipt, bank transfer id or payment provider transaction id. Required so every credit can be traced.
  reference: z.string().trim().min(3).max(80),
  note: z.string().trim().max(120).nullish(),
});

/**
 * Record a CONFIRMED payment. Admin only on purpose: members must never be able
 * to credit themselves. In production this is called by the escrow or payment
 * provider webhook after funds are confirmed, not by the browser.
 *
 * The reference makes it safe to retry: the same reference can only be recorded once per pool,
 * so a double click or a webhook retry cannot credit the money twice.
 */
export async function recordContribution(
  caller: Caller, poolId: string, userId: string, amount: number, reference: string, note?: string | null,
) {
  if (!caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
  const r = Payment.safeParse({ amount, reference, note });
  if (!r.success) throw new AppError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  const ref = r.data.reference.toLowerCase();
  const now = new Date().toISOString();
  const entryId = randomUUID();

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        { Update: { TableName: TABLE(), Key: memberKey(poolId, userId), UpdateExpression: 'SET contributed = contributed + :a', ConditionExpression: 'attribute_exists(pk)', ExpressionAttributeValues: { ':a': r.data.amount } } },
        { Update: { TableName: TABLE(), Key: poolKey(poolId), UpdateExpression: 'SET raised = raised + :a', ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(closed)', ExpressionAttributeValues: { ':a': r.data.amount } } },
        { Put: { TableName: TABLE(), Item: { pk: `POOL#${poolId}`, sk: `LEDGER#${now}#${entryId}`, entity: 'POOL_LEDGER', id: entryId, poolId, userId, amount: r.data.amount, reference: r.data.reference, note: r.data.note || 'Contribution', recordedBy: caller.sub, createdAt: now } } },
        // The reference marker. If it already exists the whole transaction is refused.
        { Put: { TableName: TABLE(), Item: { pk: `POOL#${poolId}`, sk: `REF#${ref}`, entity: 'POOL_REF', entryId, createdAt: now }, ConditionExpression: 'attribute_not_exists(pk)' } },
      ],
    }));
  } catch (err) {
    if (isConflict(err)) {
      if (reasons(err)[3]?.Code === 'ConditionalCheckFailed') throw new AppError('A payment with this reference was already recorded', 409);
      throw new AppError('Member or open pool not found', 404);
    }
    throw err;
  }
  return true;
}

/**
 * Undo a recorded payment. Admin only. The ledger is append-only, so nothing is deleted:
 * the original is marked reversed and a matching negative entry is added.
 * One payment can be reversed once, and only while the member still holds at least that much.
 */
export async function reverseContribution(caller: Caller, poolId: string, entryId: string, reason: string) {
  if (!caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
  const why = (reason ?? '').trim();
  if (why.length < 5) throw new AppError('Give a short reason for the reversal', 400);

  const rows = await queryPartition(`POOL#${poolId}`);
  const entry = rows.find((i) => i.sk.startsWith('LEDGER#') && i.id === entryId);
  if (!entry) throw new AppError('Payment not found', 404);
  if (entry.amount <= 0 || entry.reversalOf) throw new AppError('A reversal cannot be reversed', 400);
  if (entry.reversedAt) throw new AppError('This payment was already reversed', 409);

  const now = new Date().toISOString();
  // The ledger sorts by time. Make the reversal strictly later than the payment it undoes, so it can never
  // be listed before it, even if both happen in the same millisecond.
  const when = new Date(Math.max(Date.now(), Date.parse(entry.createdAt) + 1)).toISOString();
  const revId = randomUUID();
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        { Update: { TableName: TABLE(), Key: { pk: entry.pk, sk: entry.sk }, UpdateExpression: 'SET reversedAt = :at, reversedBy = :by', ConditionExpression: 'attribute_not_exists(reversedAt)', ExpressionAttributeValues: { ':at': now, ':by': caller.sub } } },
        { Update: { TableName: TABLE(), Key: memberKey(poolId, entry.userId), UpdateExpression: 'SET contributed = contributed - :a', ConditionExpression: 'contributed >= :a', ExpressionAttributeValues: { ':a': entry.amount } } },
        { Update: { TableName: TABLE(), Key: poolKey(poolId), UpdateExpression: 'SET raised = raised - :a', ConditionExpression: 'raised >= :a', ExpressionAttributeValues: { ':a': entry.amount } } },
        { Put: { TableName: TABLE(), Item: { pk: `POOL#${poolId}`, sk: `LEDGER#${when}#${revId}`, entity: 'POOL_LEDGER', id: revId, poolId, userId: entry.userId, amount: -entry.amount, reference: `reversal of ${entry.reference ?? entry.id}`, reversalOf: entry.id, note: why.slice(0, 120), recordedBy: caller.sub, createdAt: when } } },
      ],
    }));
  } catch (err) {
    if (isConflict(err)) throw new AppError('Could not reverse. It may already be reversed, or the member balance is lower than the payment.', 409);
    throw err;
  }
  return true;
}

/** A member proposes a decision for the group. */
export async function createProposal(caller: Caller, poolId: string, raw: unknown) {
  const r = ProposalInput.safeParse(raw);
  if (!r.success) throw new AppError(r.error.issues.map((i) => i.message).join('; '), 400);
  if (!(await loadMember(poolId, caller.sub))) throw new AppError('Only members can propose', 403);

  const id = randomUUID();
  const item = { id, poolId, title: r.data.title, detail: r.data.detail, createdBy: caller.sub, createdAt: new Date().toISOString() };
  await ddb.send(new TransactWriteCommand({
    TransactItems: [{ Put: { TableName: TABLE(), Item: { pk: `POOL#${poolId}`, sk: `PROP#${id}`, entity: 'POOL_PROPOSAL', ...item } } }],
  }));
  return true;
}

/** Cast or change a vote. The key (proposal + user) makes double voting impossible. */
export async function voteProposal(caller: Caller, poolId: string, proposalId: string, choice: string) {
  if (choice !== 'yes' && choice !== 'no') throw new AppError('Choice must be yes or no', 400);
  if (!(await loadMember(poolId, caller.sub))) throw new AppError('Only members can vote', 403);
  const prop = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { pk: `POOL#${poolId}`, sk: `PROP#${proposalId}` } }));
  if (!prop.Item) throw new AppError('Proposal not found', 404);

  await ddb.send(new TransactWriteCommand({
    TransactItems: [{ Put: { TableName: TABLE(), Item: {
      pk: `POOL#${poolId}`, sk: `VOTE#${proposalId}#${caller.sub}`, entity: 'POOL_VOTE',
      poolId, proposalId, userId: caller.sub, choice, createdAt: new Date().toISOString(),
    } } }],
  }));
  return true;
}

/**
 * Full pool view. Only members see names, shares, ledger and votes.
 * Everyone else gets the summary, so member identities stay private.
 */
export async function getPool(caller: Caller, id: string) {
  const items = await queryPartition(`POOL#${id}`);
  const meta = items.find((i) => i.sk === 'META');
  if (!meta) throw new AppError('Pool not found', 404);

  const out = summary(meta);
  const members = items.filter((i) => i.sk.startsWith('MEMBER#'));
  const isMember = members.some((m) => m.userId === caller.sub);
  out.viewerIsMember = isMember;
  // Members see their own pool. Admins also see it, because they record and reverse payments.
  if (!isMember && !caller.groups.includes('Admin')) return out;

  const total = members.reduce((s, m) => s + m.contributed, 0);
  out.members = members.map((m) => ({
    userId: m.userId, name: m.name, monthly: m.monthly, contributed: m.contributed, joinedAt: m.joinedAt,
    // Share follows what each member has paid in. Equal split before any payment.
    sharePct: total > 0 ? (m.contributed / total) * 100 : 100 / members.length,
  }));

  out.ledger = items.filter((i) => i.sk.startsWith('LEDGER#'))
    .sort((a, b) => b.sk.localeCompare(a.sk)).slice(0, 100)
    .map((e) => ({
      id: e.id, userId: e.userId, amount: e.amount, note: e.note, createdAt: e.createdAt,
      reference: e.reference ?? null, reversedAt: e.reversedAt ?? null, reversalOf: e.reversalOf ?? null,
    }));

  const votes = items.filter((i) => i.sk.startsWith('VOTE#'));
  const needed = quorum(meta.memberCount);
  out.proposals = items.filter((i) => i.sk.startsWith('PROP#'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => {
      const mine = votes.filter((v) => v.proposalId === p.id);
      const yes = mine.filter((v) => v.choice === 'yes').length;
      const no = mine.filter((v) => v.choice === 'no').length;
      return {
        id: p.id, title: p.title, detail: p.detail, createdBy: p.createdBy, createdAt: p.createdAt,
        yes, no, needed,
        status: yes >= needed ? 'PASSED' : no > meta.memberCount - needed ? 'REJECTED' : 'OPEN',
        myVote: mine.find((v) => v.userId === caller.sub)?.choice ?? null,
      };
    });
  return out;
}

/** Browse open pools, newest first. Optionally only pools for one listing. */
export async function listPools(input: { listingId?: string | null; limit?: number | null; nextToken?: string | null }) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE(),
    IndexName: input.listingId ? 'gsi1' : 'gsi2',
    KeyConditionExpression: input.listingId ? 'gsi1pk = :pk' : 'gsi2pk = :pk',
    ExpressionAttributeValues: { ':pk': input.listingId ? `POOLLISTING#${input.listingId}` : 'POOLS' },
    FilterExpression: 'attribute_not_exists(closed)',
    ScanIndexForward: false, Limit: limit, ExclusiveStartKey: decodeToken(input.nextToken),
  }));
  return { items: (res.Items ?? []).map((p) => summary(stripKeys(p))), nextToken: encodeToken(res.LastEvaluatedKey) };
}

/** Pools the caller belongs to (gsi3 on member items, then one BatchGet for the pools). */
export async function myPools(caller: Caller) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE(), IndexName: 'gsi3', KeyConditionExpression: 'gsi3pk = :pk',
    ExpressionAttributeValues: { ':pk': `MEMBER#${caller.sub}` }, ScanIndexForward: false, Limit: 50,
  }));
  const ids = (res.Items ?? []).map((m) => m.poolId as string);
  if (!ids.length) return [];
  const got = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE()]: { Keys: ids.map(poolKey) } } }));
  return (got.Responses?.[TABLE()] ?? []).map((p) => ({ ...summary(p), viewerIsMember: true }));
}
