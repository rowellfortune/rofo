/**
 * Geocoding tests: provider parsing, cache, TTL, validation, failures.
 * Uses a fake fetch and an in-memory table. Real providers are not called.
 * Run: npm run test:backend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ddb } from '../lib/db';
import { geocode, normalizeQuery, parseMapTiler, parseNominatim, type GeocodeDeps } from '../lib/geocode';

type Item = Record<string, any>;
const store = new Map<string, Item>();
(ddb as any).send = async (cmd: any) => {
  const name = cmd.constructor.name; const i = cmd.input;
  if (name === 'GetCommand') return { Item: store.get(`${i.Key.pk}|${i.Key.sk}`) };
  if (name === 'PutCommand') { store.set(`${i.Item.pk}|${i.Item.sk}`, { ...i.Item }); return {}; }
  throw new Error(`fake: unsupported ${name}`);
};

const NOMINATIM = [
  { lat: '5.8239', lon: '-55.1678', display_name: 'Gravenstraat 48, Paramaribo, Suriname', address: { city: 'Paramaribo', country: 'Suriname' } },
  { lat: '5.9', lon: '-55.2', display_name: 'Gravenstraat, Wanica, Suriname', address: { town: 'Lelydorp', country: 'Suriname' } },
  { lat: 'junk', lon: '1', display_name: 'broken row' },
  { lat: '95', lon: '10', display_name: 'out of range' },
];

let calls: { url: string; headers: Record<string, string> }[] = [];
const deps = (over: Partial<GeocodeDeps> = {}, body: unknown = NOMINATIM, status = 200): GeocodeDeps => ({
  apiKey: '', userAgent: 'rofo-test/1.0', now: () => 1_700_000_000_000,
  fetch: (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init!.headers as Record<string, string> });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch,
  ...over,
});

test('nominatim parsing keeps valid rows only and picks a city name', () => {
  const out = parseNominatim(NOMINATIM);
  assert.equal(out.length, 2); // junk and out-of-range rows dropped
  assert.deepEqual([out[0].lat, out[0].lng, out[0].city, out[0].country], [5.8239, -55.1678, 'Paramaribo', 'Suriname']);
  assert.equal(out[1].city, 'Lelydorp'); // falls back to town
  assert.deepEqual(parseNominatim({ not: 'an array' }), []);
});

test('maptiler parsing reads center as [lng, lat] and context for city and country', () => {
  const out = parseMapTiler({ features: [{
    place_name: 'Kaya Flamboyan 7, Willemstad, Curaçao', center: [-68.9335, 12.1084], text: 'Kaya Flamboyan',
    place_type: ['address'], context: [{ id: 'municipality.1', text: 'Willemstad' }, { id: 'country.2', text: 'Curaçao' }],
  }, { place_name: 'Nassau', center: [-77.34, 25.07], text: 'Nassau', place_type: ['municipality'], context: [{ id: 'country.9', text: 'Bahamas' }] }] });
  assert.deepEqual([out[0].lat, out[0].lng, out[0].city, out[0].country], [12.1084, -68.9335, 'Willemstad', 'Curaçao']);
  assert.equal(out[1].city, 'Nassau'); // a place result uses its own name as the city
  assert.deepEqual(parseMapTiler(null), []);
});

test('without a key it calls Nominatim with an identifying user agent and encodes the query', async () => {
  store.clear(); calls = [];
  const out = await geocode('  Gravenstraat 48,  Paramaribo ', deps());
  assert.equal(out.length, 2);
  assert.match(calls[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(calls[0].url, /q=Gravenstraat%2048%2C%20Paramaribo$/); // trimmed
  assert.equal(calls[0].headers['user-agent'], 'rofo-test/1.0');
});

test('with a key it uses MapTiler and never puts the key anywhere else', async () => {
  store.clear(); calls = [];
  await geocode('Nassau', deps({ apiKey: 'SECRET KEY' }, { features: [] }));
  assert.match(calls[0].url, /^https:\/\/api\.maptiler\.com\/geocoding\/Nassau\.json\?/);
  assert.match(calls[0].url, /key=SECRET%20KEY/); // encoded
  assert.ok(!JSON.stringify(calls[0].headers).includes('SECRET'));
});

test('results are cached for 30 days and the cache ignores case and spacing', async () => {
  store.clear(); calls = [];
  await geocode('Gravenstraat 48 Paramaribo', deps());
  await geocode('  gravenstraat   48 PARAMARIBO ', deps()); // same normalized query
  assert.equal(calls.length, 1);
  const cached = [...store.values()][0];
  assert.equal(cached.ttl, 1_700_000_000 + 30 * 86400);
  assert.equal(cached.query, normalizeQuery('Gravenstraat 48 Paramaribo'));

  // after the TTL passes the provider is asked again
  const later = deps({ now: () => (1_700_000_000 + 31 * 86400) * 1000 });
  await geocode('Gravenstraat 48 Paramaribo', later);
  assert.equal(calls.length, 2);
});

test('empty results are not cached, so a typo does not stick', async () => {
  store.clear(); calls = [];
  assert.deepEqual(await geocode('Nowhere Street 1', deps({}, [])), []);
  assert.equal(store.size, 0);
  await geocode('Nowhere Street 1', deps({}, []));
  assert.equal(calls.length, 2);
});

test('validation and provider failures', async () => {
  store.clear(); calls = [];
  await assert.rejects(geocode('ab', deps()), /3 to 200/);
  await assert.rejects(geocode('x'.repeat(201), deps()), /3 to 200/);
  await assert.rejects(geocode(undefined, deps()), /3 to 200/);
  assert.equal(calls.length, 0); // bad input never reaches the provider

  const quiet = console.error; console.error = () => {};
  try {
    await assert.rejects(geocode('Some Address 1', deps({}, {}, 429)), /unavailable right now/); // rate limited
    const boom = deps({ fetch: (async () => { throw new Error('network down'); }) as typeof fetch });
    await assert.rejects(geocode('Some Address 1', boom), /unavailable right now/);
  } finally { console.error = quiet; }
  assert.equal(store.size, 0); // failures are never cached
});
