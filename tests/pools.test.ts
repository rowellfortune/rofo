/**
 * Pool vote and payment logic on the frontend: validation, money parsing, API calls, tally.
 * Run: npm run test:frontend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiCreateProposal, apiRecordContribution, apiReverseContribution } from '../src/api/pools';
import { toPool, type ApiPool } from '../src/api/mappers';
import { transport } from '../src/api/transport';
import { buildPayment, buildProposal, parseAmount, validReason } from '../src/lib/poolForms';
import { proposalView, raised } from '../src/lib/pools';
import type { Pool } from '../src/types';

test('amounts: accepts normal money formats, rejects everything risky', () => {
  for (const [raw, want] of [['200', 200], ['1,250.50', 1250.5], ['$300', 300], [' 45.5 ', 45.5], ['0.01', 0.01]] as const) {
    assert.equal(parseAmount(raw), want, raw);
  }
  // each of these could credit the wrong amount, so all must be refused
  for (const raw of ['', '0', '0.00', '-5', 'abc', '12abc', '1.234', '1e3', '1,2,3x', '10000000.01', '--1', '€5', '5 USD']) {
    assert.equal(parseAmount(raw), null, `"${raw}" must be rejected`);
  }
  assert.equal(parseAmount('10000000'), 10_000_000); // the limit itself is allowed
});

test('payment form needs member, amount and a reference, and trims', () => {
  const ok = buildPayment({ userId: 'u1', amount: '$1,200.00', reference: '  BANK-77  ', note: ' first ' });
  assert.ok(ok.ok);
  assert.deepEqual(ok.input, { userId: 'u1', amount: 1200, reference: 'BANK-77', note: 'first' });

  const bad = buildPayment({ userId: '', amount: '0', reference: 'x', note: 'n'.repeat(121) });
  assert.ok(!bad.ok);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['amount', 'note', 'reference', 'userId']);
  assert.ok(!buildPayment({ userId: 'u', amount: '5', reference: 'r'.repeat(81), note: '' }).ok);
});

test('proposal form and reversal reason', () => {
  const ok = buildProposal('  Offer 270,000 USD  ', '  details  ');
  assert.ok(ok.ok && ok.input.title === 'Offer 270,000 USD' && ok.input.detail === 'details');
  assert.ok(!buildProposal('hi', '').ok); // headline too short
  assert.ok(!buildProposal('x'.repeat(121), '').ok);
  assert.ok(!buildProposal('A fine headline', 'd'.repeat(1001)).ok);
  assert.ok(buildProposal('A fine headline', '').ok); // detail is optional
  assert.equal(validReason('typo'), false);
  assert.equal(validReason(' wrong amount entered '), true);
});

test('API calls send the right variables as a signed in user', async () => {
  const seen: { field: string; mode: string; vars: Record<string, unknown> }[] = [];
  transport.call = (async (field: string, _q: string, vars: Record<string, unknown>, mode: string) => { seen.push({ field, mode, vars }); return true; }) as unknown as typeof transport.call;

  await apiCreateProposal('p1', { title: 'Hire a surveyor', detail: '' });
  await apiRecordContribution('p1', { userId: 'u1', amount: 200, reference: 'REF-1' });
  await apiRecordContribution('p1', { userId: 'u1', amount: 50, reference: 'REF-2', note: 'cash' });
  await apiReverseContribution('p1', 'e1', 'wrong amount entered');

  assert.ok(seen.every((c) => c.mode === 'userPool'));
  assert.deepEqual(seen[0].vars, { poolId: 'p1', input: { title: 'Hire a surveyor', detail: '' } });
  assert.deepEqual(seen[1].vars, { poolId: 'p1', userId: 'u1', amount: 200, reference: 'REF-1', note: null }); // no note is sent as null
  assert.equal(seen[2].vars.note, 'cash');
  assert.deepEqual(seen[3].vars, { poolId: 'p1', entryId: 'e1', reason: 'wrong amount entered' });
  assert.deepEqual(seen.map((c) => c.field), ['createPoolProposal', 'recordPoolContribution', 'recordPoolContribution', 'reversePoolContribution']);
});

const apiPool = (over: Partial<ApiPool> = {}): ApiPool => ({
  id: 'p1', name: 'N', listingId: 'l1', listingPrice: 100000, goal: 25000, raised: 1800, maxMembers: 4, memberCount: 2,
  targetMonths: 24, status: 'SAVING', creatorId: 'u1', createdAt: '2026-01-01T00:00:00.000Z', viewerIsMember: true,
  members: [], proposals: [], ledger: [
    { id: 'e1', userId: 'u1', amount: 2000, note: 'meant 200', createdAt: '2026-02-01T10:00:00.000Z', reference: 'T-1', reversedAt: '2026-02-01T11:00:00.000Z', reversalOf: null },
    { id: 'e2', userId: 'u1', amount: -2000, note: 'typo', createdAt: '2026-02-01T11:00:00.000Z', reference: 'reversal of T-1', reversedAt: null, reversalOf: 'e1' },
    { id: 'e3', userId: 'u1', amount: 1800, note: 'ok', createdAt: '2026-02-02T10:00:00.000Z', reference: 'T-2' },
  ], ...over,
});

test('ledger mapping keeps references and reversal links, and old payloads still map', () => {
  const pool = toPool(apiPool());
  assert.deepEqual(pool.ledger.map((e) => [e.id, e.amount, e.reference, Boolean(e.reversedAt), e.reversalOf ?? null]), [
    ['e1', 2000, 'T-1', true, null], ['e2', -2000, 'reversal of T-1', false, 'e1'], ['e3', 1800, 'T-2', false, null],
  ]);
  assert.equal(raised(pool), 1800); // totals come from the server, not from summing entries
  // a payload with no reference fields at all (older data) maps without throwing
  const old = apiPool({ ledger: [{ id: 'e9', userId: 'u1', amount: 10, note: 'old', createdAt: '2026-01-05T00:00:00.000Z' }] });
  assert.equal(toPool(old).ledger[0].reference, null);
});

test('vote tally: server result wins, and thresholds are honest', () => {
  const server = toPool(apiPool({
    proposals: [{ id: 'x', title: 'T', detail: '', createdBy: 'u1', createdAt: '2026-01-02T00:00:00.000Z', yes: 3, no: 1, needed: 3, status: 'PASSED', myVote: 'no' }],
  }));
  const v = proposalView(server, server.proposals[0], 'u1');
  assert.deepEqual([v.yes, v.no, v.needed, v.status, v.myVote], [3, 1, 3, 'PASSED', 'no']);

  // demo pools count their own votes: 4 members need 3 yes, so 2 yes is not enough
  const demo: Pool = {
    id: 'd', name: 'D', listingId: 'l', maxMembers: 4, targetMonths: 12, createdAt: '2026-01-01T00:00:00.000Z', ledger: [],
    members: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, monthly: 1, contributed: 0, joinedAt: '2026-01-01' })),
    proposals: [{ id: 'q', title: 'Q', detail: '', votes: { a: 'yes', b: 'yes', c: 'no' } }],
  };
  assert.equal(proposalView(demo, demo.proposals[0], 'a').status, 'OPEN');
  demo.proposals[0].votes.d = 'yes';
  assert.equal(proposalView(demo, demo.proposals[0], 'a').status, 'PASSED');
  demo.proposals[0].votes = { a: 'no', b: 'no', c: 'no' }; // 3 no of 4 members: yes can never reach 3
  assert.equal(proposalView(demo, demo.proposals[0], 'a').status, 'REJECTED');
});
