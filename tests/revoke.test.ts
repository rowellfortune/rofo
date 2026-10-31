/**
 * Revoking agent access on the frontend: API call, helpers, hidden listing mapping.
 * Run: npm run test:frontend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiRevokeAgent } from '../src/api/applications';
import { toListing, type ApiListing } from '../src/api/mappers';
import { transport } from '../src/api/transport';
import { canReapply, isRevokedError } from '../src/lib/applicationForm';

test('revoke sends the user, the reason and the hide choice as a signed in admin', async () => {
  const seen: { field: string; mode: string; vars: Record<string, unknown> }[] = [];
  transport.call = (async (field: string, _q: string, vars: Record<string, unknown>, mode: string) => {
    seen.push({ field, mode, vars }); return { userId: 'u1', status: 'REVOKED', listingsHidden: 3, listingsFailed: 0 };
  }) as unknown as typeof transport.call;

  const out = await apiRevokeAgent('u1', 'Fake photos', true);
  await apiRevokeAgent('u2', 'Left the agency', false);
  assert.equal(out.listingsHidden, 3);
  assert.deepEqual(seen.map((c) => [c.field, c.mode]), [['revokeAgentAccess', 'userPool'], ['revokeAgentAccess', 'userPool']]);
  assert.deepEqual(seen[0].vars, { userId: 'u1', reason: 'Fake photos', hideListings: true });
  assert.equal(seen[1].vars.hideListings, false); // false is sent, not dropped
});

test('who may apply again', () => {
  assert.equal(canReapply('REJECTED'), true);
  assert.equal(canReapply('REVOKED'), true);
  for (const s of ['PENDING', 'APPROVED'] as const) assert.equal(canReapply(s), false);
});

test('the revoked error is recognised however the server words it', () => {
  assert.equal(isRevokedError('Agent access was revoked'), true);
  assert.equal(isRevokedError('agent access was revoked.'), true);
  for (const other of ['Not allowed', 'Listing not found', 'Internal error', '']) assert.equal(isRevokedError(other), false);
});

test('hidden listings are marked and visible listings are not', () => {
  const base: ApiListing = {
    id: 'x', deal: 'buy', type: 'House', title: 'T', address: 'A', city: 'C', country: 'K', price: 1, beds: 0, baths: 0, areaM2: 0,
    isNew: false, description: 'd', features: [], images: [], agentId: 'a', agentName: 'n', agency: 'g', phone: 'p', createdAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(toListing({ ...base, suspended: true }).suspended, true);
  assert.equal(toListing({ ...base, suspended: false }).suspended, false);
  assert.equal(toListing(base).suspended, false); // older responses with no field mean visible
  assert.equal(toListing({ ...base, suspended: null }).suspended, false);
});
