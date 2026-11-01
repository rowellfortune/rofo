/**
 * Admins must have two step verification on. Unit tests for the policy, then the real GraphQL handler,
 * so we know the rule is actually wired into every admin entry point.
 * Run: npm run test:backend
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ddb } from '../lib/db';
import { applyAdminMfaPolicy, CACHE_MS, MFA_CHECK_FAILED_MESSAGE, MFA_REQUIRED_MESSAGE, resetMfaCache, type MfaDeps } from '../lib/mfa';
import { mfaDeps } from '../lib/mfaDeps';
import { handler } from '../graphql/handler';
import { requireGroup, type Caller } from '../utils/GraphqlUtil';

const who = (sub: string, groups: string[]): Caller => ({ sub, name: sub, email: `${sub}@x.io`, groups });

/** Policy dependencies with a fake clock and a switchable answer. */
function fakeDeps(initial: boolean | 'error') {
  const state = { answer: initial as boolean | 'error', calls: 0, t: 1_000_000 };
  const deps: MfaDeps = {
    now: () => state.t,
    hasTotp: async () => { state.calls++; if (state.answer === 'error') throw new Error('cognito down'); return state.answer; },
  };
  return { state, deps };
}
beforeEach(() => resetMfaCache());

test('people who are not admins are never looked up', async () => {
  const { state, deps } = fakeDeps(false);
  for (const groups of [[], ['Client'], ['Agent'], ['Client', 'Agent']]) {
    const c = who('u', groups);
    assert.equal(await applyAdminMfaPolicy(c, deps), c); // the same object, untouched
  }
  assert.equal(state.calls, 0); // no Cognito call, so no extra latency for ordinary requests
});

test('an admin with two step verification keeps admin rights', async () => {
  const { deps } = fakeDeps(true);
  const out = await applyAdminMfaPolicy(who('a', ['Admin']), deps);
  assert.deepEqual([out.groups, out.adminBlocked], [['Admin'], undefined]);
});

test('an admin without it becomes an ordinary user, and the reason is recorded', async () => {
  const { deps } = fakeDeps(false);
  const out = await applyAdminMfaPolicy(who('a', ['Client', 'Admin']), deps);
  assert.deepEqual([out.groups, out.adminBlocked], [['Client'], 'mfa']);
  assert.throws(() => requireGroup(out, ['Admin']), new RegExp(MFA_REQUIRED_MESSAGE)); // told why, not just "Not allowed"
  assert.throws(() => requireGroup(out, ['Agent', 'Admin']), new RegExp(MFA_REQUIRED_MESSAGE));
  assert.throws(() => requireGroup(who('x', ['Client']), ['Admin']), /Not allowed/); // a normal user still gets the plain message
});

test('an admin who is also an agent keeps the agent rights', async () => {
  const { deps } = fakeDeps(false);
  const out = await applyAdminMfaPolicy(who('a', ['Agent', 'Admin']), deps);
  assert.deepEqual(out.groups, ['Agent']);
  requireGroup(out, ['Agent', 'Admin']); // still allowed through the agent door
});

test('a yes is remembered for a minute, a no is never remembered', async () => {
  const { state, deps } = fakeDeps(true);
  const c = who('a', ['Admin']);
  await applyAdminMfaPolicy(c, deps); await applyAdminMfaPolicy(c, deps);
  assert.equal(state.calls, 1); // second request used the memory

  state.t += CACHE_MS - 1; await applyAdminMfaPolicy(c, deps);
  assert.equal(state.calls, 1); // still inside the minute
  state.t += 2; state.answer = false; // the minute is over and they switched MFA off meanwhile
  assert.equal((await applyAdminMfaPolicy(c, deps)).adminBlocked, 'mfa');
  assert.equal(state.calls, 2);

  // a no is rechecked every time, so turning MFA on works at once
  state.answer = true;
  assert.deepEqual((await applyAdminMfaPolicy(c, deps)).groups, ['Admin']);
  assert.equal(state.calls, 3);
});

test('if the check itself fails, admin rights are withheld and nothing is remembered', async () => {
  const { state, deps } = fakeDeps('error');
  const quiet = console.error; console.error = () => {};
  try {
    const out = await applyAdminMfaPolicy(who('a', ['Admin']), deps);
    assert.deepEqual([out.groups, out.adminBlocked], [[], 'check']);
    assert.throws(() => requireGroup(out, ['Admin']), new RegExp(MFA_CHECK_FAILED_MESSAGE));
    state.answer = true; // Cognito recovers
    assert.deepEqual((await applyAdminMfaPolicy(who('a', ['Admin']), deps)).groups, ['Admin']);
  } finally { console.error = quiet; }
});

test('one admin\'s answer is never used for another', async () => {
  const { state, deps } = fakeDeps(true);
  await applyAdminMfaPolicy(who('first', ['Admin']), deps);
  state.answer = false;
  assert.equal((await applyAdminMfaPolicy(who('second', ['Admin']), deps)).adminBlocked, 'mfa');
});

// ---------------------------------------------------------------- through the real handler

const store = new Map<string, Record<string, any>>();
(ddb as any).send = async (cmd: any) => {
  const name = cmd.constructor.name, i = cmd.input;
  if (name === 'GetCommand') return { Item: store.get(`${i.Key.pk}|${i.Key.sk}`) };
  if (name === 'QueryCommand') {
    const pk = i.ExpressionAttributeValues[':pk'];
    return { Items: [...store.values()].filter((x) => x.pk === pk || x.gsi2pk === pk) };
  }
  throw new Error(`fake: unsupported ${name}`);
};

/** An AppSync event from a signed in user. */
const event = (sub: string, groups: string[], fieldName: string, args: Record<string, unknown> = {}) => ({
  info: { fieldName, parentTypeName: 'Query' }, arguments: args,
  identity: { sub, groups, claims: { email: `${sub}@x.io`, name: sub } },
}) as any;
const call = (sub: string, groups: string[], field: string, args?: Record<string, unknown>) =>
  (handler as any)(event(sub, groups, field, args)) as Promise<{ success: boolean; data?: any; error?: string }>;

let mfa: boolean | 'error' = false, lookups = 0;
mfaDeps.hasTotp = async () => { lookups++; if (mfa === 'error') throw new Error('down'); return mfa; };
const ADMIN_FIELDS: [string, Record<string, unknown>][] = [
  ['agentApplications', { status: 'PENDING' }],
  ['reviewAgentApplication', { userId: 'u', decision: 'APPROVED' }],
  ['revokeAgentAccess', { userId: 'u', reason: 'a good reason' }],
  ['recordPoolContribution', { poolId: 'p', userId: 'u', amount: 5, reference: 'REF-1' }],
  ['reversePoolContribution', { poolId: 'p', entryId: 'e', reason: 'wrong amount' }],
];

test('handler: every admin only operation is refused for an admin without two step verification', async () => {
  mfa = false; resetMfaCache();
  for (const [field, args] of ADMIN_FIELDS) {
    const r = await call('admin1', ['Client', 'Admin'], field, args);
    assert.deepEqual([field, r.success, r.error], [field, false, MFA_REQUIRED_MESSAGE]);
  }
});

test('handler: the same operations work for an admin who has it on', async () => {
  mfa = true; resetMfaCache();
  const r = await call('admin2', ['Admin'], 'agentApplications', { status: 'PENDING' });
  assert.deepEqual([r.success, r.data], [true, []]);
  // and another admin only operation gets past the permission check (it then fails for its own reason: no such application)
  const rev = await call('admin2', ['Admin'], 'reviewAgentApplication', { userId: 'nobody', decision: 'APPROVED' });
  assert.match(rev.error!, /not found/i);
});

test('handler: an admin cannot reach agent tools or other people\'s data without it either', async () => {
  mfa = false; resetMfaCache();
  for (const field of ['myListings', 'createListing', 'geocodeAddress', 'listingInquiries']) {
    const r = await call('admin3', ['Admin'], field, { input: {}, query: 'x', listingId: 'l' });
    assert.deepEqual([field, r.error], [field, MFA_REQUIRED_MESSAGE]);
  }
  // pool detail: admins normally see members of every pool. Without MFA they see what a stranger sees.
  store.set('POOL#p1|META', { pk: 'POOL#p1', sk: 'META', id: 'p1', name: 'P', listingId: 'l', listingPrice: 1, goal: 1, raised: 0, maxMembers: 3, memberCount: 1, targetMonths: 6, creatorId: 'm', createdAt: '2026-01-01T00:00:00.000Z' });
  store.set('POOL#p1|MEMBER#m', { pk: 'POOL#p1', sk: 'MEMBER#m', userId: 'm', name: 'Member', monthly: 1, contributed: 0, joinedAt: '2026-01-01' });
  assert.equal((await call('admin3', ['Admin'], 'getPool', { id: 'p1' })).data.members.length, 0);
  mfa = true; resetMfaCache();
  assert.equal((await call('admin3', ['Admin'], 'getPool', { id: 'p1' })).data.members.length, 1);
});

test('handler: an admin who is also an agent still works as an agent without it', async () => {
  mfa = false; resetMfaCache();
  const r = await call('both', ['Agent', 'Admin'], 'createListing', { input: {} });
  assert.equal(r.success, false);
  assert.match(r.error!, /title/i); // got past the permission check and failed on the empty form instead
  assert.notEqual(r.error, MFA_REQUIRED_MESSAGE);
});

test('handler: failing closed, and no lookups for ordinary users', async () => {
  mfa = 'error'; resetMfaCache();
  const quiet = console.error; console.error = () => {};
  try { assert.equal((await call('admin4', ['Admin'], 'agentApplications', { status: 'PENDING' })).error, MFA_CHECK_FAILED_MESSAGE); }
  finally { console.error = quiet; }

  lookups = 0; mfa = false;
  await call('buyer', ['Client'], 'myFavorites'); await call('agent', ['Agent'], 'myListings');
  assert.equal(lookups, 0); // buyers and agents never trigger a Cognito call
});
