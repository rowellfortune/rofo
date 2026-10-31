/**
 * Hidden listings: bulk hide and restore, search, edits, favorites.
 * In-memory table that mimics the DynamoDB behaviours the code relies on:
 * Limit applies BEFORE the filter, pages come back with LastEvaluatedKey, updates honour conditions.
 * Run: npm run test:backend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ddb } from '../lib/db';
import { listingIndexKeys, listingKey, favoriteKey } from '../lib/keys';
import { myFavorites, searchListings, setListingsSuspended, updateListing } from '../lib/listings';
import type { Caller } from '../utils/GraphqlUtil';

type Item = Record<string, any>;
const store = new Map<string, Item>();
const k = (key: { pk: string; sk: string }) => `${key.pk}|${key.sk}`;
let pageSize = 0;           // 0 = one page. Otherwise return this many evaluated rows per page.
let failUpdateFor = '';     // listing id whose update should fail
const quietErr = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };

/** Evaluate the AND-joined condition strings the code uses. */
function holds(it: Item | undefined, expr: string | undefined, names: Record<string, string> = {}, vals: Record<string, any> = {}): boolean {
  if (!expr) return true;
  return expr.split(' AND ').every((raw) => {
    const c = raw.trim(); let m: RegExpMatchArray | null;
    const attr = (a: string) => names[a] ?? a;
    if ((m = c.match(/^attribute_not_exists\((#?\w+)\)$/))) return !it || it[attr(m[1])] === undefined;
    if ((m = c.match(/^attribute_exists\((#?\w+)\)$/))) return !!it && it[attr(m[1])] !== undefined;
    if ((m = c.match(/^(#?\w+) = (:\w+)$/))) return !!it && it[attr(m[1])] === vals[m[2]];
    if ((m = c.match(/^(#?\w+) >= (:\w+)$/))) return !!it && it[attr(m[1])] >= vals[m[2]];
    if ((m = c.match(/^(#?\w+) <= (:\w+)$/))) return !!it && it[attr(m[1])] <= vals[m[2]];
    throw new Error(`fake: unsupported condition ${c}`);
  });
}

(ddb as any).send = async (cmd: any) => {
  const n = cmd.constructor.name, i = cmd.input;
  if (n === 'GetCommand') return { Item: store.get(k(i.Key)) };
  if (n === 'PutCommand') {
    if (!holds(store.get(k(i.Item)), i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues)) throw Object.assign(new Error('c'), { name: 'ConditionalCheckFailedException' });
    store.set(k(i.Item), { ...i.Item }); return {};
  }
  if (n === 'BatchGetCommand') {
    const t = Object.keys(i.RequestItems)[0];
    return { Responses: { [t]: i.RequestItems[t].Keys.map((x: any) => store.get(k(x))).filter(Boolean) } };
  }
  if (n === 'UpdateCommand') {
    const it = store.get(k(i.Key))!;
    if (it && it.id === failUpdateFor) throw new Error('throttled');
    if (!holds(it, i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues)) throw Object.assign(new Error('c'), { name: 'ConditionalCheckFailedException' });
    if (i.UpdateExpression.startsWith('REMOVE')) i.UpdateExpression.replace('REMOVE ', '').split(', ').forEach((a: string) => delete it[a]);
    else for (const part of i.UpdateExpression.replace('SET ', '').split(', ')) { const [l, r] = part.split(' = '); it[l] = i.ExpressionAttributeValues[r]; }
    return {};
  }
  if (n === 'QueryCommand') {
    const idx: string = i.IndexName; const pk = `${idx}pk`, sk = `${idx}sk`;
    let rows = [...store.values()].filter((x) => x[pk] === i.ExpressionAttributeValues[':pk']);
    if (i.KeyConditionExpression.includes('begins_with')) rows = rows.filter((x) => String(x[sk]).startsWith(i.ExpressionAttributeValues[':deal']));
    rows.sort((a, b) => String(a[sk]).localeCompare(String(b[sk])));
    if (i.ScanIndexForward === false) rows.reverse();
    if (i.ExclusiveStartKey) { const at = rows.findIndex((x) => x.pk === i.ExclusiveStartKey.pk && x.sk === i.ExclusiveStartKey.sk); rows = rows.slice(at + 1); }
    const take = Math.min(i.Limit ?? Infinity, pageSize || Infinity);
    const evaluated = rows.slice(0, take); // Limit counts rows BEFORE the filter, like DynamoDB
    const items = evaluated.filter((x) => holds(x, i.FilterExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues));
    const more = rows.length > take;
    const last = evaluated[evaluated.length - 1];
    return { Items: items, LastEvaluatedKey: more && last ? { pk: last.pk, sk: last.sk, [pk]: last[pk], [sk]: last[sk] } : undefined };
  }
  throw new Error(`fake: unsupported ${n}`);
};

let seq = 0;
/** Add a listing owned by `agentId`. */
function addListing(agentId: string, over: Item = {}): string {
  const id = `l${++seq}`;
  const base = { id, deal: 'buy', type: 'House', price: 100000 + seq, beds: 3, baths: 1, areaM2: 100, city: 'Paramaribo', country: 'Suriname', agentId, agentName: 'N', createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`, ...over };
  store.set(k(listingKey(id)), { ...listingKey(id), ...listingIndexKeys(base as any), entity: 'LISTING', ...base });
  return id;
}
const reset = () => { store.clear(); pageSize = 0; failUpdateFor = ''; seq = 0; };
const visible = async (input: Item = {}) => (await searchListings({ deal: 'buy', limit: 50, ...input } as any)).items.map((x: any) => x.id);
const admin: Caller = { sub: 'root', name: 'Root', email: 'r@x.io', groups: ['Admin'] };

test('hiding takes every listing of that agent out of public search, and only theirs', async () => {
  reset();
  const mine = [addListing('a1'), addListing('a1'), addListing('a1')];
  const other = addListing('a2');
  assert.equal((await visible()).length, 4);

  const out = await setListingsSuspended('a1', true);
  assert.deepEqual(out, { changed: 3, failed: 0 });
  assert.deepEqual(await visible(), [other]); // the other agent is untouched
  assert.ok(mine.every((id) => store.get(k(listingKey(id)))!.suspendedReason === 'revocation')); // tagged so only we restore them

  assert.deepEqual(await setListingsSuspended('a1', true), { changed: 0, failed: 0 }); // running it twice changes nothing
});

test('hidden listings are excluded by place search too, and other filters still work', async () => {
  reset();
  const cheap = addListing('a1', { price: 50000 }), dear = addListing('a1', { price: 900000, type: 'Villa' }), keep = addListing('a2', { price: 60000 });
  await setListingsSuspended('a1', true);
  const byPlace = await searchListings({ deal: 'buy', city: 'Paramaribo', country: 'Suriname', limit: 50 } as any);
  assert.deepEqual(byPlace.items.map((x: any) => x.id), [keep]);
  assert.deepEqual(await visible({ maxPrice: 70000 }), [keep]); // price filter combined with the hidden filter
  assert.deepEqual(await visible({ type: 'Villa' }), []); // the only villa is hidden
  assert.ok(![cheap, dear].some((id) => byPlace.items.some((x: any) => x.id === id)));
});

test('restoring brings back revocation-hidden listings and leaves other hidden ones alone', async () => {
  reset();
  const a = addListing('a1'), b = addListing('a1'), manual = addListing('a1', { suspended: true, suspendedReason: 'complaint' });
  await setListingsSuspended('a1', true); // hides a and b, manual already hidden for its own reason
  assert.deepEqual(await visible(), []);
  const out = await setListingsSuspended('a1', false);
  assert.deepEqual(out, { changed: 2, failed: 0 });
  assert.deepEqual((await visible()).sort(), [a, b].sort());
  assert.equal(store.get(k(listingKey(manual)))!.suspended, true); // not ours to restore
  assert.ok(store.get(k(listingKey(a)))!.suspended === undefined && store.get(k(listingKey(a)))!.suspendedReason === undefined);
});

test('one failing listing does not stop the rest, and the failure is counted', async () => {
  reset();
  const ids = [addListing('a1'), addListing('a1'), addListing('a1')];
  failUpdateFor = ids[1];
  const restore = quietErr();
  try { assert.deepEqual(await setListingsSuspended('a1', true), { changed: 2, failed: 1 }); } finally { restore(); }
  failUpdateFor = '';
  assert.deepEqual(await setListingsSuspended('a1', true), { changed: 1, failed: 0 }); // a re-run finishes the job
  assert.deepEqual(await visible(), []);
});

test('an agent with many listings is handled across pages', async () => {
  reset(); pageSize = 2;
  for (let n = 0; n < 7; n++) addListing('big');
  assert.deepEqual(await setListingsSuspended('big', true), { changed: 7, failed: 0 });
  assert.deepEqual(await visible(), []);
});

test('hidden listings stay hidden when paging with filters that read ahead', async () => {
  reset(); pageSize = 2;
  const keep = [addListing('ok'), addListing('ok')];
  for (let n = 0; n < 5; n++) addListing('gone');
  await setListingsSuspended('gone', true);
  assert.deepEqual((await visible()).sort(), keep.sort()); // paging past hidden rows still finds the visible ones
});

test('an edit by an admin does not un-hide a hidden listing', async () => {
  reset();
  const id = addListing('a1');
  await setListingsSuspended('a1', true);
  await updateListing(admin, id, {
    deal: 'buy', type: 'House', title: 'Edited title', address: 'Main Street 1', city: 'Paramaribo', country: 'Suriname', price: 123456,
    beds: 3, baths: 1, areaM2: 100, description: 'An edited description that is long enough.', agency: 'Agency', phone: '12345',
  });
  const saved = store.get(k(listingKey(id)))!;
  assert.equal(saved.title, 'Edited title'); // the edit went through
  assert.deepEqual([saved.suspended, saved.suspendedReason], [true, 'revocation']); // still hidden
  assert.deepEqual(await visible(), []);
});

test('saved listings that were hidden disappear from "my favorites"', async () => {
  reset();
  const shown = addListing('a1'), gone = addListing('a2');
  for (const id of [shown, gone]) store.set(k(favoriteKey('u1', id)), { ...favoriteKey('u1', id), entity: 'FAVORITE', listingId: id });
  (ddb as any).sendFav = null;
  // the favorites query reads the user partition (no index), so give the fake what it needs
  const realSend = (ddb as any).send;
  (ddb as any).send = async (cmd: any) => {
    if (cmd.constructor.name === 'QueryCommand' && !cmd.input.IndexName) {
      return { Items: [...store.values()].filter((x) => x.pk === cmd.input.ExpressionAttributeValues[':pk'] && x.sk.startsWith('FAV#')) };
    }
    return realSend(cmd);
  };
  try {
    assert.equal((await myFavorites({ sub: 'u1', name: 'U', email: 'u@x.io', groups: ['Client'] })).length, 2);
    await setListingsSuspended('a2', true);
    assert.deepEqual((await myFavorites({ sub: 'u1', name: 'U', email: 'u@x.io', groups: ['Client'] })).map((l: any) => l.id), [shown]);
  } finally { (ddb as any).send = realSend; }
});
