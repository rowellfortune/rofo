/**
 * Logic test for pools. Runs against a tiny in-memory DynamoDB fake that
 * supports only the expressions the pool code uses. It does NOT replace a
 * test against real DynamoDB, but it catches wrong conditions and shapes.
 * Run: npm run test:backend
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ddb } from '../lib/db';
import * as P from '../lib/pools';
import { listingKey } from '../lib/keys';
import type { Caller } from '../utils/GraphqlUtil';

type Item = Record<string, any>;
const store = new Map<string, Item>();
const k = (i: { pk: string; sk: string }) => `${i.pk}|${i.sk}`;

/** Evaluate the simple condition strings used by the pool code. */
function cond(item: Item | undefined, expr: string | undefined, vals: Record<string, any> = {}): boolean {
  if (!expr) return true;
  return expr.split(' AND ').every((c) => {
    c = c.trim();
    let m: RegExpMatchArray | null;
    if ((m = c.match(/^attribute_not_exists\((\w+)\)$/))) return !item || item[m[1]] === undefined;
    if ((m = c.match(/^attribute_exists\((\w+)\)$/))) return !!item && item[m[1]] !== undefined;
    if ((m = c.match(/^(\w+) < (\w+)$/))) return item![m[1]] < item![m[2]];
    if ((m = c.match(/^(\w+) > (:\w+)$/))) return item![m[1]] > vals[m[2]];
    if ((m = c.match(/^(\w+) = (:\w+)$/))) return item![m[1]] === vals[m[2]];
    throw new Error(`fake: unsupported condition ${c}`);
  });
}

(ddb as any).send = async (cmd: any) => {
  const i = cmd.input; const name = cmd.constructor.name;
  if (name === 'GetCommand') return { Item: store.get(k(i.Key)) };
  if (name === 'BatchGetCommand') {
    const keys = Object.values(i.RequestItems)[0] as any;
    return { Responses: { [Object.keys(i.RequestItems)[0]]: keys.Keys.map((x: any) => store.get(k(x))).filter(Boolean) } };
  }
  if (name === 'QueryCommand') {
    const idx = i.IndexName as string | undefined;
    const pkAttr = idx ? `${idx}pk` : 'pk', skAttr = idx ? `${idx}sk` : 'sk';
    let rows = [...store.values()].filter((it) => it[pkAttr] === i.ExpressionAttributeValues[':pk']);
    if (i.FilterExpression) rows = rows.filter((it) => cond(it, i.FilterExpression));
    rows.sort((a, b) => String(a[skAttr]).localeCompare(String(b[skAttr])));
    if (i.ScanIndexForward === false) rows.reverse();
    return { Items: i.Limit ? rows.slice(0, i.Limit) : rows };
  }
  if (name === 'TransactWriteCommand') {
    for (const t of i.TransactItems) { // check every condition first, apply nothing on failure
      const op = t.Put ?? t.Update ?? t.Delete;
      const key = t.Put ? { pk: t.Put.Item.pk, sk: t.Put.Item.sk } : op.Key;
      if (!cond(store.get(k(key)), op.ConditionExpression, op.ExpressionAttributeValues)) {
        const e = new Error('cancelled'); e.name = 'TransactionCanceledException'; throw e;
      }
    }
    for (const t of i.TransactItems) {
      if (t.Put) store.set(k(t.Put.Item), { ...t.Put.Item });
      else if (t.Delete) store.delete(k(t.Delete.Key));
      else {
        const it = store.get(k(t.Update.Key))!; const v = t.Update.ExpressionAttributeValues;
        const m = t.Update.UpdateExpression.match(/^SET (\w+) = \1 ([+-]) (:\w+)$/)!;
        it[m[1]] += (m[2] === '+' ? 1 : -1) * v[m[3]];
      }
    }
    return {};
  }
  throw new Error(`fake: unsupported ${name}`);
};

const who = (sub: string, groups: string[] = ['Client']): Caller => ({ sub, name: sub.toUpperCase(), email: `${sub}@x.io`, groups });
const A = who('a'), B = who('b'), C = who('c'), D = who('d'), ADMIN = who('root', ['Admin']);
const LISTING = '11111111-1111-4111-8111-111111111111';
store.set(k(listingKey(LISTING)), { ...listingKey(LISTING), id: LISTING, deal: 'buy', price: 100000, agentId: 'agent' });

test('pool lifecycle', async () => {
  const pool = await P.createPool(A, { name: 'Test Pool', listingId: LISTING, maxMembers: 3, targetMonths: 24, monthly: 200 });
  assert.equal(pool.goal, 25000); // 25% of 100,000
  assert.equal(pool.status, 'FORMING');

  await P.joinPool(B, pool.id, 200);
  await P.joinPool(C, pool.id, 150);
  await assert.rejects(P.joinPool(D, pool.id, 100), /full/); // seat limit holds
  await assert.rejects(P.joinPool(B, pool.id, 100), /already joined/); // no double join

  await assert.rejects(P.recordContribution(A, pool.id, 'a', 5000), /Not allowed/); // members cannot credit themselves
  await P.recordContribution(ADMIN, pool.id, 'a', 6000, 'escrow ref 1');
  await P.recordContribution(ADMIN, pool.id, 'b', 2000);
  await assert.rejects(P.recordContribution(ADMIN, pool.id, 'zz', 100), /not found/); // unknown member

  await assert.rejects(P.leavePool(B, pool.id), /paid in/); // cannot leave after paying
  await assert.rejects(P.leavePool(A, pool.id), /creator/);
  await P.leavePool(C, pool.id); // paid nothing, can leave
  assert.equal((await P.getPool(A, pool.id)).memberCount, 2);

  const prop = await P.createProposal(A, pool.id, { title: 'Hire a surveyor', detail: 'Cost 450' });
  assert.equal(prop, true);
  let view = await P.getPool(A, pool.id);
  const pid = (view.proposals[0] as any).id;
  await assert.rejects(P.voteProposal(D, pool.id, pid, 'yes'), /Only members/);
  await P.voteProposal(A, pool.id, pid, 'yes');
  await P.voteProposal(B, pool.id, pid, 'yes');
  await P.voteProposal(B, pool.id, pid, 'yes'); // revote does not double count

  view = await P.getPool(A, pool.id);
  const pr = view.proposals[0] as any;
  assert.deepEqual([pr.yes, pr.no, pr.needed, pr.status, pr.myVote], [2, 0, 2, 'PASSED', 'yes']);
  assert.equal(view.raised, 8000);
  const shares = Object.fromEntries((view.members as any[]).map((m) => [m.userId, m.sharePct]));
  assert.equal(shares.a, 75); assert.equal(shares.b, 25); // proportional to paid in
  assert.equal(view.ledger.length, 2);

  const outsider = await P.getPool(D, pool.id); // privacy: non-members see no member data
  assert.deepEqual([outsider.members.length, outsider.ledger.length, outsider.proposals.length, outsider.viewerIsMember], [0, 0, 0, false]);

  assert.equal((await P.listPools({})).items.length, 1);
  assert.equal((await P.listPools({ listingId: LISTING })).items.length, 1);
  assert.equal((await P.listPools({ listingId: 'other' })).items.length, 0);
  assert.equal((await P.myPools(A)).length, 1);
  assert.equal((await P.myPools(C)).length, 0); // left, so no longer listed
});
