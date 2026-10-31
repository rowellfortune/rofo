/**
 * Agent application tests. In-memory table that honours the conditional writes the code relies on.
 * Run: npm run test:backend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ddb } from '../lib/db';
import {
  assertActiveAgent, listApplications, myApplication, reviewApplication, revokeAgent, submitApplication, type ApplicationDeps,
} from '../lib/applications';
import type { Caller } from '../utils/GraphqlUtil';

type Item = Record<string, any>;
const store = new Map<string, Item>();
const k = (key: { pk: string; sk: string }) => `${key.pk}|${key.sk}`;
const conflict = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });

/** Evaluate the two condition strings the code uses. */
function cond(item: Item | undefined, expr: string | undefined, names: Record<string, string> = {}, vals: Record<string, any> = {}): boolean {
  if (!expr) return true;
  if (expr === 'attribute_not_exists(pk) OR #status = :rejected') return !item || item[names['#status']] === vals[':rejected'];
  if (expr === 'attribute_not_exists(pk) OR #status = :rejected OR #status = :revoked') return !item || [vals[':rejected'], vals[':revoked']].includes(item[names['#status']]);
  if (expr === '#status = :from') return !!item && item[names['#status']] === vals[':from'];
  throw new Error(`fake: unsupported condition ${expr}`);
}

/** Apply a SET expression like "SET #status = :to, gsi2pk = :g". */
function applySet(it: Item, i: any) {
  for (const part of i.UpdateExpression.replace(/^SET /, '').split(', ')) {
    const [lhs, rhs] = part.split(' = ');
    it[i.ExpressionAttributeNames?.[lhs] ?? lhs] = i.ExpressionAttributeValues[rhs];
  }
}

(ddb as any).send = async (cmd: any) => {
  const n = cmd.constructor.name, i = cmd.input;
  if (n === 'GetCommand') return { Item: store.get(k(i.Key)) };
  if (n === 'PutCommand') {
    if (!cond(store.get(k(i.Item)), i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues)) throw conflict();
    store.set(k(i.Item), { ...i.Item }); return {};
  }
  if (n === 'DeleteCommand') { store.delete(k(i.Key)); return {}; }
  if (n === 'UpdateCommand') {
    const it = store.get(k(i.Key));
    if (!cond(it, i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues)) throw conflict();
    applySet(it!, i);
    return { Attributes: { ...it } };
  }
  if (n === 'TransactWriteCommand') {
    // all conditions first, nothing applied if any fails (like DynamoDB)
    for (const t of i.TransactItems) {
      const op = t.Put ?? t.Update ?? t.Delete;
      const key = t.Put ? { pk: t.Put.Item.pk, sk: t.Put.Item.sk } : op.Key;
      if (!cond(store.get(k(key)), op.ConditionExpression, op.ExpressionAttributeNames, op.ExpressionAttributeValues)) {
        throw Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' });
      }
    }
    for (const t of i.TransactItems) {
      if (t.Put) store.set(k(t.Put.Item), { ...t.Put.Item });
      else if (t.Delete) store.delete(k(t.Delete.Key));
      else applySet(store.get(k(t.Update.Key))!, t.Update);
    }
    return {};
  }
  if (n === 'QueryCommand') {
    let rows = [...store.values()].filter((x) => x.gsi2pk === i.ExpressionAttributeValues[':pk']);
    rows.sort((a, b) => String(a.gsi2sk).localeCompare(String(b.gsi2sk)));
    if (i.ScanIndexForward === false) rows.reverse();
    return { Items: rows };
  }
  throw new Error(`fake: unsupported ${n}`);
};

const who = (sub: string, groups: string[] = ['Client']): Caller => ({ sub, name: sub.toUpperCase(), email: `${sub}@x.io`, groups });
const ADMIN = who('root', ['Admin']);
const app = { name: 'Ann Lee', agency: 'Palm Realty', phone: '+597 123 4567', registrationNo: 'KKF-12345', country: 'Suriname', website: 'https://palm.example', about: 'Ten years selling homes in Paramaribo and Wanica.' };

let granted: string[] = [], removed: string[] = [], hidden: string[] = [], restored: string[] = [];
let failGroup = false, failRemove = false, failHide = false;
const deps = (t = '2026-05-01T10:00:00.000Z'): ApplicationDeps => ({
  now: () => new Date(t),
  addToAgentGroup: async (id) => { if (failGroup) throw new Error('cognito down'); granted.push(id); },
  removeFromAgentGroup: async (id) => { if (failRemove) throw new Error('cognito down'); removed.push(id); },
  hideListings: async (id) => { if (failHide) throw new Error('dynamo down'); hidden.push(id); return { changed: 3, failed: 0 }; },
  restoreListings: async (id) => { restored.push(id); return { changed: 3, failed: 0 }; },
});
const reset = () => { store.clear(); granted = []; removed = []; hidden = []; restored = []; failGroup = failRemove = failHide = false; };

test('apply, appear in the queue, approve, and the Agent group is granted', async () => {
  store.clear(); granted = []; failGroup = false;
  assert.equal(await myApplication(who('u1')), null);

  const a = await submitApplication(who('u1'), app, deps());
  assert.deepEqual([a.status, a.email, a.website], ['PENDING', 'u1@x.io', 'https://palm.example']);
  assert.equal((await myApplication(who('u1')))!.status, 'PENDING');
  assert.equal((await listApplications(ADMIN, 'PENDING')).length, 1);

  const done = await reviewApplication(ADMIN, 'u1', 'APPROVED', null, deps('2026-05-02T09:00:00.000Z'));
  assert.equal(done.status, 'APPROVED');
  assert.deepEqual(granted, ['u1']);
  assert.equal((await listApplications(ADMIN, 'PENDING')).length, 0); // moved out of the pending queue
  assert.equal((await listApplications(ADMIN, 'APPROVED')).length, 1);
  assert.equal((await myApplication(who('u1')))!.reviewedAt, '2026-05-02T09:00:00.000Z');
});

test('input is validated and double applications are refused', async () => {
  store.clear();
  await assert.rejects(submitApplication(who('u2'), { ...app, about: 'too short' }, deps()), /about/);
  await assert.rejects(submitApplication(who('u2'), { ...app, website: 'javascript:alert(1)' }, deps()), /http/);
  await assert.rejects(submitApplication(who('u2'), { ...app, registrationNo: 'ab' }, deps()), /registrationNo/);
  await assert.rejects(submitApplication(who('u2'), { ...app, name: undefined }, deps()), /name/);
  assert.equal(store.size, 0); // nothing saved for bad input

  await submitApplication(who('u2'), app, deps());
  await assert.rejects(submitApplication(who('u2'), app, deps()), /already have an application/); // pending
  await assert.rejects(submitApplication(who('x', ['Agent']), app, deps()), /already have agent access/);
  await assert.rejects(submitApplication(who('y', ['Admin']), app, deps()), /already have agent access/);
});

test('rejection needs a reason, can be resubmitted, and keeps the first created date', async () => {
  store.clear(); granted = [];
  await submitApplication(who('u3'), app, deps('2026-05-01T10:00:00.000Z'));
  await assert.rejects(reviewApplication(ADMIN, 'u3', 'REJECTED', '  ', deps()), /reason/);
  await reviewApplication(ADMIN, 'u3', 'REJECTED', 'Registration number could not be verified', deps());
  const rejected = (await myApplication(who('u3')))!;
  assert.deepEqual([rejected.status, rejected.reviewNote], ['REJECTED', 'Registration number could not be verified']);
  assert.deepEqual(granted, []); // rejection never touches the group

  const again = await submitApplication(who('u3'), { ...app, registrationNo: 'KKF-99999' }, deps('2026-05-09T10:00:00.000Z'));
  assert.equal(again.status, 'PENDING');
  assert.equal(again.reviewNote, null); // the old reason is cleared
  assert.equal(again.createdAt, '2026-05-01T10:00:00.000Z'); // first date kept
  assert.equal((await listApplications(ADMIN, 'REJECTED')).length, 0);
  assert.equal((await listApplications(ADMIN, 'PENDING')).length, 1);
});

test('only admins review, and a decision cannot be made twice', async () => {
  store.clear(); granted = [];
  await submitApplication(who('u4'), app, deps());
  await assert.rejects(reviewApplication(who('u9', ['Agent']), 'u4', 'APPROVED', null, deps()), /Not allowed/);
  await assert.rejects(listApplications(who('u9'), 'PENDING'), /Not allowed/);
  await assert.rejects(reviewApplication(ADMIN, 'nobody', 'APPROVED', null, deps()), /not found/);
  await assert.rejects(reviewApplication(ADMIN, 'u4', 'MAYBE' as never, null, deps()), /Decision/);

  await reviewApplication(ADMIN, 'u4', 'APPROVED', null, deps());
  await assert.rejects(reviewApplication(ADMIN, 'u4', 'REJECTED', 'changed my mind', deps()), /already reviewed/);
  await assert.rejects(reviewApplication(ADMIN, 'u4', 'APPROVED', null, deps()), /already reviewed/);
  assert.deepEqual(granted, ['u4']); // granted exactly once
});

test('if Cognito fails the approval is undone and the application stays pending', async () => {
  store.clear(); granted = []; failGroup = true;
  await submitApplication(who('u5'), app, deps());
  const quiet = console.error; console.error = () => {};
  try { await assert.rejects(reviewApplication(ADMIN, 'u5', 'APPROVED', null, deps()), /still pending/); }
  finally { console.error = quiet; failGroup = false; }
  assert.equal((await myApplication(who('u5')))!.status, 'PENDING'); // never "approved" without access
  assert.equal((await listApplications(ADMIN, 'PENDING')).length, 1);
  assert.equal((await listApplications(ADMIN, 'APPROVED')).length, 0);

  await reviewApplication(ADMIN, 'u5', 'APPROVED', null, deps()); // retry works
  assert.deepEqual(granted, ['u5']);
});

// ---------------------------------------------------------------- revoking

/** Apply and approve a user so there is someone to revoke. */
async function approvedAgent(sub: string) {
  await submitApplication(who(sub), app, deps());
  await reviewApplication(ADMIN, sub, 'APPROVED', null, deps());
  granted = []; removed = []; hidden = []; restored = []; // only count what the revoke does
}

test('revoking removes access, blocks the old token at once, and hides listings', async () => {
  reset(); await approvedAgent('a1');
  const staleToken = who('a1', ['Client', 'Agent']); // the token still says Agent for up to an hour
  await assertActiveAgent(staleToken); // before the revoke it works

  const out = await revokeAgent(ADMIN, 'a1', 'Listings were fake', true, deps('2026-06-01T08:00:00.000Z')) as any;
  assert.deepEqual([out.status, out.reviewNote, out.listingsHidden, out.listingsFailed], ['REVOKED', 'Listings were fake', 3, 0]);
  assert.deepEqual([removed, hidden], [['a1'], ['a1']]); // Cognito group removed, listings hidden

  await assert.rejects(assertActiveAgent(staleToken), /Agent access was revoked/); // blocked despite the stale token
  await assertActiveAgent(who('someone-else', ['Agent'])); // other agents are untouched
  await assertActiveAgent(ADMIN); // admins are never blocked
  assert.equal((await listApplications(ADMIN, 'REVOKED')).length, 1);
  assert.equal((await listApplications(ADMIN, 'APPROVED')).length, 0);
});

test('listings stay visible when the admin chooses not to hide them', async () => {
  reset(); await approvedAgent('a2');
  const out = await revokeAgent(ADMIN, 'a2', 'Moved to another agency', false, deps()) as any;
  assert.deepEqual([out.status, out.listingsHidden, hidden], ['REVOKED', 0, []]);
});

test('revoke is admin only and refuses bad input', async () => {
  reset(); await approvedAgent('a3');
  await assert.rejects(revokeAgent(who('a9', ['Agent']), 'a3', 'a good reason', true, deps()), /Not allowed/);
  await assert.rejects(revokeAgent(ADMIN, 'a3', 'no', true, deps()), /reason/);
  await assert.rejects(revokeAgent(ADMIN, 'root', 'revoke myself', true, deps()), /your own access/);
  await assert.rejects(revokeAgent(ADMIN, 'ghost', 'never applied here', true, deps()), /No application found/);
  assert.deepEqual([removed, hidden], [[], []]); // none of the refusals touched anything
  await assertActiveAgent(who('a3', ['Agent'])); // still fine

  await submitApplication(who('p1'), app, deps()); // pending, not approved
  await assert.rejects(revokeAgent(ADMIN, 'p1', 'not an agent yet', true, deps()), /Only an approved agent/);
});

test('a second revoke is refused and does nothing', async () => {
  reset(); await approvedAgent('a4');
  await revokeAgent(ADMIN, 'a4', 'first revoke here', true, deps());
  removed = []; hidden = [];
  await assert.rejects(revokeAgent(ADMIN, 'a4', 'second revoke here', true, deps()), /already revoked/);
  assert.deepEqual([removed, hidden], [[], []]);
});

test('if Cognito fails the revoke is undone completely', async () => {
  reset(); await approvedAgent('a5'); failRemove = true;
  const quiet = console.error; console.error = () => {};
  try { await assert.rejects(revokeAgent(ADMIN, 'a5', 'trying to revoke', true, deps()), /Nothing was changed/); }
  finally { console.error = quiet; failRemove = false; }
  assert.equal((await myApplication(who('a5')))!.status, 'APPROVED'); // record matches reality: they still have the group
  await assertActiveAgent(who('a5', ['Agent'])); // marker removed, not locked out
  assert.equal(hidden.length, 0); // listings untouched
  assert.equal((await listApplications(ADMIN, 'APPROVED')).length, 1);
  await revokeAgent(ADMIN, 'a5', 'trying again now', true, deps()); // and a retry works
  assert.equal((await myApplication(who('a5')))!.status, 'REVOKED');
});

test('if hiding listings fails the revoke still stands and says how many failed', async () => {
  reset(); await approvedAgent('a6'); failHide = true;
  const quiet = console.error; console.error = () => {};
  let out: any;
  try { out = await revokeAgent(ADMIN, 'a6', 'revoke with a bad hide', true, deps()); } finally { console.error = quiet; failHide = false; }
  assert.deepEqual([out.status, out.listingsFailed], ['REVOKED', -1]);
  await assert.rejects(assertActiveAgent(who('a6', ['Agent'])), /revoked/); // access is gone regardless
});

test('a revoked agent can apply again, the reviewer sees why, and approval lifts the block', async () => {
  reset(); await approvedAgent('a7');
  await revokeAgent(ADMIN, 'a7', 'Complaint 42: fake photos', true, deps('2026-06-01T08:00:00.000Z'));

  const again = await submitApplication(who('a7'), { ...app, about: 'I have fixed my listing process and photos.' }, deps('2026-07-01T08:00:00.000Z')) as any;
  assert.equal(again.status, 'PENDING');
  assert.deepEqual([again.priorRevocationNote, again.priorRevocationAt], ['Complaint 42: fake photos', '2026-06-01T08:00:00.000Z']);
  await assert.rejects(assertActiveAgent(who('a7', ['Client'])).then(() => assertActiveAgent(who('a7', ['Agent']))), /revoked/); // still blocked while pending

  await reviewApplication(ADMIN, 'a7', 'APPROVED', null, deps('2026-07-02T08:00:00.000Z'));
  assert.deepEqual([granted, restored], [['a7'], ['a7']]); // group back, listings restored
  await assertActiveAgent(who('a7', ['Agent'])); // block lifted
  const final = (await myApplication(who('a7')))!;
  assert.equal(final.status, 'APPROVED');
  assert.equal(final.priorRevocationNote, 'Complaint 42: fake photos'); // history kept
});

test('a re-application that is rejected stays blocked and keeps the history', async () => {
  reset(); await approvedAgent('a8');
  await revokeAgent(ADMIN, 'a8', 'first problem here', true, deps());
  await submitApplication(who('a8'), app, deps());
  await reviewApplication(ADMIN, 'a8', 'REJECTED', 'Still not convinced', deps());
  await assert.rejects(assertActiveAgent(who('a8', ['Agent'])), /revoked/);
  const cur = (await myApplication(who('a8')))!;
  assert.deepEqual([cur.status, cur.priorRevocationNote], ['REJECTED', 'first problem here']);
  await submitApplication(who('a8'), app, deps()); // and they may try once more
  assert.equal((await myApplication(who('a8')))!.priorRevocationNote, 'first problem here'); // carried through a second resubmission
});
