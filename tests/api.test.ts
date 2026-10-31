/**
 * Data layer tests with a fake transport (no network, no Amplify).
 * Run: npm run test:frontend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiGetListing, apiSearch } from '../src/api/listings';
import { hasCoords, toListing, toPool, type ApiListing, type ApiPool } from '../src/api/mappers';
import { transport } from '../src/api/transport';
import { memberCount, proposalView, raised } from '../src/lib/pools';

const row = (over: Partial<ApiListing>): ApiListing => ({
  id: 'id-1', deal: 'buy', type: 'House', title: 'T', address: 'A 1', city: 'Paramaribo', country: 'Suriname',
  price: 100, beds: 2, baths: 1, areaM2: 80, plotM2: null, yearBuilt: null, isNew: false, openHouse: null,
  description: 'd', features: [], images: [], lat: null, lng: null, agentId: 'a', agentName: 'Ann', agency: 'Ag',
  phone: '1', createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

test('search runs one query per deal, merges, filters text and sorts', async () => {
  const calls: { field: string; input: Record<string, unknown>; mode: string }[] = [];
  transport.call = (async (field: string, _q: string, vars: { input: Record<string, unknown> }, mode: string) => {
    calls.push({ field, input: vars.input, mode });
    return vars.input.deal === 'buy'
      ? { items: [row({ id: 'b1', price: 300, createdAt: '2026-03-01T00:00:00.000Z' }), row({ id: 'b2', price: 100, city: 'Nassau', country: 'Bahamas', createdAt: '2026-01-01T00:00:00.000Z' })] }
      : { items: [row({ id: 'r1', deal: 'rent', price: 200, createdAt: '2026-02-01T00:00:00.000Z' })] };
  }) as unknown as typeof transport.call;

  // no deal filter: both deals are queried, guests use the identity pool
  let out = await apiSearch(new URLSearchParams());
  assert.deepEqual(calls.map((c) => c.input.deal).sort(), ['buy', 'rent']);
  assert.ok(calls.every((c) => c.mode === 'identityPool'));
  assert.deepEqual(out.map((l) => l.id), ['b1', 'r1', 'b2']); // newest first across deals

  // text filter runs client side, price sort reorders the merged list
  out = await apiSearch(new URLSearchParams('q=suriname&sort=price-asc'));
  assert.deepEqual(out.map((l) => l.id), ['r1', 'b1']);
  assert.equal(calls.at(-1)!.input.sortBy, 'price_asc');

  // filters are sent to the server
  calls.length = 0;
  await apiSearch(new URLSearchParams('deal=buy&type=Villa&min=50000&max=900000&beds=3'));
  assert.equal(calls.length, 1);
  assert.deepEqual(
    [calls[0].input.type, calls[0].input.minPrice, calls[0].input.maxPrice, calls[0].input.minBeds],
    ['Villa', 50000, 900000, 3],
  );
});

test('getListing caches, returns undefined for not found, and does not cache failures', async () => {
  let n = 0;
  transport.call = (async (_f: string, _q: string, vars: { id: string }) => {
    n++;
    if (vars.id === 'missing') throw new Error('Listing not found');
    if (vars.id === 'boom') throw new Error('Internal error');
    return row({ id: vars.id });
  }) as unknown as typeof transport.call;

  await apiGetListing('cached'); await apiGetListing('cached');
  assert.equal(n, 1); // second read hit the cache
  assert.equal(await apiGetListing('missing'), undefined);
  await assert.rejects(apiGetListing('boom'), /Internal error/);
  await assert.rejects(apiGetListing('boom'), /Internal error/);
  assert.equal(n, 4); // the failure was retried, not cached
});

test('listing mapper: hue is stable, missing coordinates are skipped on maps', () => {
  const a = toListing(row({ id: 'abc' })), b = toListing(row({ id: 'abc' }));
  assert.equal(a.hue, b.hue);
  assert.equal(a.agent.name, 'Ann');
  assert.equal(hasCoords(a), false); // no geocode yet
  assert.equal(hasCoords(toListing(row({ lat: 5.8, lng: -55.2 }))), true);
  assert.deepEqual(toListing(row({ images: ['listings/u/x.jpg', 'https://cdn/y.jpg'] })).images?.[1], 'https://cdn/y.jpg');
});

test('pool mapper: summaries keep server totals, members get tallies from the server', () => {
  const base: ApiPool = {
    id: 'p1', name: 'N', listingId: 'l1', listingPrice: 100000, goal: 25000, raised: 8000, maxMembers: 4,
    memberCount: 3, targetMonths: 24, status: 'SAVING', creatorId: 'u1', createdAt: '2026-01-01T00:00:00.000Z',
    viewerIsMember: false, members: [], ledger: [], proposals: [],
  };
  const summary = toPool(base); // non-member view: no member list
  assert.equal(raised(summary), 8000);
  assert.equal(memberCount(summary), 3);

  const full = toPool({
    ...base, viewerIsMember: true,
    members: [{ userId: 'u1', name: 'A', monthly: 200, contributed: 6000, sharePct: 75, joinedAt: '2026-01-01T00:00:00.000Z' }],
    proposals: [{ id: 'x', title: 'T', detail: '', createdBy: 'u1', createdAt: '2026-01-02T00:00:00.000Z', yes: 2, no: 0, needed: 2, status: 'PASSED', myVote: 'yes' }],
  });
  const v = proposalView(full, full.proposals[0], 'u1');
  assert.deepEqual([v.yes, v.needed, v.status, v.myVote], [2, 2, 'PASSED', 'yes']);
});
