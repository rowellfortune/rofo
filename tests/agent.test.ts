/**
 * Agent dashboard logic: form validation, upload sequence, API calls.
 * Run: npm run test:frontend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiCreateListing, apiDeleteListing, apiGeocode, apiListingInquiries, apiMyListings, apiUpdateListing } from '../src/api/agent';
import { apiGetListing } from '../src/api/listings';
import { transport } from '../src/api/transport';
import { checkImage, uploadImage, type UploadDeps } from '../src/api/upload';
import { applyCandidate, buildListingInput, emptyForm, geocodeQuery, listingToForm, type ListingForm } from '../src/lib/listingForm';
import type { ApiListing } from '../src/api/mappers';
import { toListing } from '../src/api/mappers';

const valid = (over: Partial<ListingForm> = {}): ListingForm => ({
  ...emptyForm({ agency: 'Palm Realty', phone: '+597 123 4567' }),
  title: 'Bright family home', address: 'Gravenstraat 48', city: 'Paramaribo', country: 'Suriname',
  price: '285000', beds: '4', baths: '2', areaM2: '190', description: 'A restored wooden house with a garden.',
  ...over,
});

test('valid form builds the exact API payload', () => {
  const r = buildListingInput(valid({
    features: ' Pool, Garage ,, Solar ', plotM2: '450', yearBuilt: '1952', openHouse: ' Sat 11:00 ', lat: '5.8239', lng: '-55.1678',
    images: [{ key: 'listings/u/a.jpg', preview: 'blob:1' }],
  }));
  assert.ok(r.ok);
  assert.deepEqual(r.input.features, ['Pool', 'Garage', 'Solar']); // trimmed, blanks dropped
  assert.equal(r.input.price, 285000);
  assert.equal(r.input.plotM2, 450);
  assert.equal(r.input.openHouse, 'Sat 11:00');
  assert.deepEqual(r.input.images, ['listings/u/a.jpg']); // keys only, never preview URLs
  assert.deepEqual([r.input.lat, r.input.lng], [5.8239, -55.1678]);
});

test('optional fields become null, not empty strings or zero', () => {
  const r = buildListingInput(valid());
  assert.ok(r.ok);
  assert.deepEqual([r.input.plotM2, r.input.yearBuilt, r.input.openHouse, r.input.lat, r.input.lng], [null, null, null, null, null]);
});

test('validation catches what the server would reject', () => {
  const bad = buildListingInput(valid({
    title: 'ab', price: '0', beds: '2.5', yearBuilt: '1200', lat: '95', lng: '10', description: 'short', phone: '1',
  }));
  assert.ok(!bad.ok);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['beds', 'description', 'lat', 'phone', 'price', 'title', 'yearBuilt']);

  // one coordinate without the other
  const half = buildListingInput(valid({ lat: '5.8' }));
  assert.ok(!half.ok && half.errors.lat === 'Set both latitude and longitude');
  // junk numbers and too many photos
  assert.ok(!buildListingInput(valid({ price: 'abc' })).ok);
  const many = buildListingInput(valid({ images: Array.from({ length: 21 }, (_, i) => ({ key: `k${i}`, preview: '' })) }));
  assert.ok(!many.ok && many.errors.images);
});

test('edit form round trips a listing', () => {
  const api: ApiListing = {
    id: 'x', deal: 'rent', type: 'Apartment', title: 'T title', address: 'Addr 1', city: 'Nassau', country: 'Bahamas',
    price: 1450, beds: 2, baths: 1, areaM2: 88, plotM2: null, yearBuilt: 2016, isNew: true, openHouse: null,
    description: 'a long enough description', features: ['A', 'B'], images: ['listings/u/1.jpg'], lat: null, lng: null,
    agentId: 'a', agentName: 'N', agency: 'Ag', phone: '12345', createdAt: '2026-01-01T00:00:00.000Z',
  };
  const form = listingToForm(toListing(api));
  assert.equal(form.features, 'A, B');
  assert.equal(form.lat, ''); // no coordinates stays blank, not "NaN"
  assert.deepEqual(form.images.map((i) => i.key), ['listings/u/1.jpg']);
  const back = buildListingInput(form);
  assert.ok(back.ok);
  assert.deepEqual(back.input.images, ['listings/u/1.jpg']);
});

test('image checks', () => {
  assert.equal(checkImage({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }), null);
  assert.match(checkImage({ name: 'a.gif', type: 'image/gif', size: 1000 })!, /JPEG, PNG or WebP/);
  assert.match(checkImage({ name: 'big.png', type: 'image/png', size: 9 * 1024 * 1024 })!, /8 MB/);
  assert.match(checkImage({ name: 'e.png', type: 'image/png', size: 0 })!, /empty/);
});

test('upload asks for a presigned POST, then sends the file last to S3', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const deps: UploadDeps = {
    restUrl: 'https://rest.test', getToken: async () => 'ID-TOKEN',
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/uploads/presign')) {
        return new Response(JSON.stringify({ success: true, data: { url: 'https://bucket.s3.test/', fields: { key: 'listings/u/z.png', policy: 'p' }, key: 'listings/u/z.png' } }));
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  };
  const file = new File([new Uint8Array([1, 2, 3])], 'z.png', { type: 'image/png' }) as unknown as globalThis.File;
  const key = await uploadImage(file, deps);
  assert.equal(key, 'listings/u/z.png');

  const [presign, s3] = calls;
  assert.equal((presign.init!.headers as Record<string, string>).authorization, 'Bearer ID-TOKEN');
  assert.deepEqual(JSON.parse(presign.init!.body as string), { contentType: 'image/png' });
  const names = [...(s3.init!.body as FormData).keys()];
  assert.equal(names.at(-1), 'file'); // S3 ignores fields that come after the file
  assert.deepEqual(names, ['key', 'policy', 'file']);

  // server refusal and S3 failure both surface as errors
  const refuse: UploadDeps = { ...deps, fetch: (async () => new Response(JSON.stringify({ success: false, error: 'Sign in required' }))) as typeof fetch };
  await assert.rejects(uploadImage(file, refuse), /Sign in required/);
  const s3fail: UploadDeps = { ...deps, fetch: (async (u: string) => u.endsWith('/uploads/presign')
    ? new Response(JSON.stringify({ success: true, data: { url: 'https://b/', fields: {}, key: 'k' } })) : new Response(null, { status: 403 })) as typeof fetch };
  await assert.rejects(uploadImage(file, s3fail), /Upload failed \(403\)/);
  await assert.rejects(uploadImage(file, { ...deps, restUrl: '' }), /not configured/);
});

test('agent API calls use the signed-in (userPool) mode and clear the read cache on change', async () => {
  const log: { field: string; mode: string; vars: Record<string, unknown> }[] = [];
  let reads = 0;
  transport.call = (async (field: string, _q: string, vars: Record<string, unknown>, mode: string) => {
    log.push({ field, mode, vars });
    if (field === 'getListing') { reads++; return { id: 'L1', deal: 'buy', type: 'House', title: 'T', address: 'A', city: 'C', country: 'K', price: 1, beds: 0, baths: 0, areaM2: 0, isNew: false, description: 'd', features: [], images: [], agentId: 'a', agentName: 'n', agency: 'g', phone: 'p', createdAt: '2026-01-01T00:00:00.000Z' }; }
    if (field === 'createListing') return { id: 'new-id' };
    if (field === 'myListings') return null; // API can return null for an empty list
    if (field === 'listingInquiries') return [{ id: 'i1', listingId: 'L1', name: 'N', email: 'e@x.io', message: 'hello', createdAt: '2026-01-02T00:00:00.000Z' }];
    return true;
  }) as unknown as typeof transport.call;

  const r = buildListingInput(valid()); assert.ok(r.ok);
  assert.equal(await apiCreateListing(r.input), 'new-id');
  assert.deepEqual(await apiMyListings(), []); // null becomes an empty list
  assert.equal((await apiListingInquiries('L1')).length, 1);

  await apiGetListing('L1'); await apiGetListing('L1');
  assert.equal(reads, 1);
  await apiUpdateListing('L1', r.input);
  await apiGetListing('L1');
  assert.equal(reads, 2); // edit cleared the cache
  await apiDeleteListing('L1');
  await apiGetListing('L1');
  assert.equal(reads, 3); // delete cleared it too

  assert.ok(log.filter((c) => c.field !== 'getListing').every((c) => c.mode === 'userPool'));
  assert.deepEqual(log.find((c) => c.field === 'updateListing')!.vars.id, 'L1');
});

test('geocode query joins the address parts and needs a street', () => {
  assert.equal(geocodeQuery({ address: 'Gravenstraat 48', city: ' Paramaribo ', country: 'Suriname' }), 'Gravenstraat 48, Paramaribo, Suriname');
  assert.equal(geocodeQuery({ address: 'Gravenstraat 48', city: '', country: '' }), 'Gravenstraat 48'); // blanks skipped
  assert.equal(geocodeQuery({ address: 'ab', city: 'Paramaribo', country: 'Suriname' }), null); // too short to search
});

test('choosing a place sets the pin and fills only blank city and country', () => {
  const place = { label: 'x', lat: 5.823912345, lng: -55.167812345, city: 'Paramaribo', country: 'Suriname' };

  const blank = applyCandidate(valid({ city: '', country: '' }), place);
  assert.deepEqual([blank.lat, blank.lng, blank.city, blank.country], ['5.82391', '-55.16781', 'Paramaribo', 'Suriname']); // 5 decimals

  const typed = applyCandidate(valid({ city: 'Pbo', country: 'SR' }), place);
  assert.deepEqual([typed.city, typed.country], ['Pbo', 'SR']); // the agent's wording is kept

  const noMeta = applyCandidate(valid({ city: '', country: '' }), { ...place, city: null, country: null });
  assert.deepEqual([noMeta.city, noMeta.country], ['', '']); // null does not become the text "null"

  // the result still passes validation once the rest is filled in
  const built = buildListingInput(applyCandidate(valid(), place));
  assert.ok(built.ok && built.input.lat === 5.82391);
});

test('apiGeocode asks as a signed in user and tolerates a null list', async () => {
  const seen: { field: string; mode: string; vars: Record<string, unknown> }[] = [];
  transport.call = (async (field: string, _q: string, vars: Record<string, unknown>, mode: string) => {
    seen.push({ field, mode, vars });
    return vars.query === 'empty' ? null : [{ label: 'A', lat: 1, lng: 2, city: null, country: null }];
  }) as unknown as typeof transport.call;
  assert.equal((await apiGeocode('Some street 1')).length, 1);
  assert.deepEqual(await apiGeocode('empty'), []);
  assert.ok(seen.every((c) => c.field === 'geocodeAddress' && c.mode === 'userPool'));
});
