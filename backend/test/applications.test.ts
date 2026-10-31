/**
 * Agent application tests. In-memory table that honours the conditional writes the code relies on.
 * Run: npm run test:backend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ddb } from '../lib/db';
import { listApplications, myApplication, reviewApplication, submitApplication, type ApplicationDeps } from '../lib/applications';
import type { Caller } from '../utils/GraphqlUtil';

type Item = Record<string, any>;
const store = new Map<string, Item>();
const k = (key: { pk: string; sk: string }) => `${key.pk}|${key.sk}`;
const conflict = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });

/** Evaluate the two condition strings the code uses. */
function cond(item: Item | undefined, expr: string | undefined, names: Record<string, string> = {}, vals: Record<string, any> = {}): boolean {
  if (!expr) return true;
  if (expr === 'attribute_not_exists(pk) OR #status = :rejected') return !item || item[names['#status']] === vals[':rejected'];
  if (expr === '#status = :from') return !!item && item[names['#status']] === vals[':from'];
  throw new Error(`fake: unsupported condition ${expr}`);
}

(ddb as any).send = async (cmd: any) => {
  const n = cmd.constructor.name, i = cmd.input;
  if (n === 'GetCommand') return { Item: store.get(k(i.Key)) };
  if (n === 'PutCommand') {
    if (!cond(store.get(k(i.Item)), i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues)) throw conflict();
    store.set(k(i.Item), { ...i.Item }); return {};
  }
  if (n === 'UpdateCommand') {
    const it = store.get(k(i.Key));
    if (!cond(it, i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues)) throw conflict();
    const m = i.UpdateExpression.match(/^SET (.+)$/)![1].split(', ');
    for (const part of m) {
      const [lhs, rhs] = part.split(' = ');
      it![i.ExpressionAttributeNames?.[lhs] ?? lhs] = i.ExpressionAttributeValues[rhs];
    }
    return { Attributes: { ...it } };
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

let granted: string[] = [];
let failGroup = false;
const deps = (t = '2026-05-01T10:00:00.000Z'): ApplicationDeps => ({
  now: () => new Date(t),
  addToAgentGroup: async (id) => { if (failGroup) throw new Error('cognito down'); granted.push(id); },
});

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
