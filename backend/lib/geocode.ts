import { createHash } from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { AppError } from '../utils/AppError';
import { ddb, TABLE } from './db';

/** One place a search can resolve to. */
export interface GeoCandidate {
  label: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
}

/** Things the handler injects. Tests replace them. */
export interface GeocodeDeps {
  fetch: typeof fetch;
  /** MapTiler key. Empty means "use Nominatim (no key)". */
  apiKey: string;
  /** Nominatim policy: identify your app. Put a contact in here for production. */
  userAgent: string;
  now: () => number;
}

const CACHE_DAYS = 30;
const MAX_RESULTS = 5;

/** Same address, different spacing or case, should hit the same cache entry. */
export const normalizeQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, ' ');
const cacheKey = (q: string) => ({ pk: `GEO#${createHash('sha1').update(normalizeQuery(q)).digest('hex')}`, sk: 'META' });

/** Keep only results with real, in-range coordinates. */
const valid = (c: GeoCandidate): boolean =>
  Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;

// ---------------------------------------------------------------- providers

/** Nominatim (OpenStreetMap). Free, no key. Low volume, button-triggered searches only. */
export function parseNominatim(rows: unknown): GeoCandidate[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: Record<string, any>) => {
    const a = r.address ?? {};
    return {
      label: String(r.display_name ?? ''),
      lat: Number(r.lat),
      lng: Number(r.lon),
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? null,
      country: a.country ?? null,
    };
  }).filter(valid).slice(0, MAX_RESULTS);
}

/** MapTiler Geocoding (GeoJSON). Needs a key. Higher limits for production. */
export function parseMapTiler(body: unknown): GeoCandidate[] {
  const features = (body as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  return features.map((f: Record<string, any>) => {
    const ctx: { id?: string; text?: string }[] = Array.isArray(f.context) ? f.context : [];
    const find = (prefix: string) => ctx.find((c) => c.id?.startsWith(prefix))?.text ?? null;
    const isPlace = Array.isArray(f.place_type) && f.place_type.some((t: string) => ['municipality', 'place', 'locality'].includes(t));
    return {
      label: String(f.place_name ?? f.text ?? ''),
      lng: Number(f.center?.[0]),
      lat: Number(f.center?.[1]),
      city: (isPlace ? f.text : null) ?? find('municipality') ?? find('place') ?? find('locality') ?? null,
      country: find('country'),
    };
  }).filter(valid).slice(0, MAX_RESULTS);
}

/** Ask the provider. Any failure becomes one friendly error, details go to the logs. */
async function lookup(query: string, deps: GeocodeDeps): Promise<GeoCandidate[]> {
  const useKey = deps.apiKey.length > 0;
  const url = useKey
    ? `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?limit=${MAX_RESULTS}&key=${encodeURIComponent(deps.apiKey)}`
    : `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${MAX_RESULTS}&q=${encodeURIComponent(query)}`;
  try {
    const res = await deps.fetch(url, {
      headers: { 'user-agent': deps.userAgent, accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`provider status ${res.status}`);
    const body = await res.json();
    return useKey ? parseMapTiler(body) : parseNominatim(body);
  } catch (err) {
    console.error('Geocoding failed', useKey ? 'maptiler' : 'nominatim', (err as Error).message); // never log the key
    throw new AppError('Address search is unavailable right now. Place the pin on the map instead.', 502);
  }
}

// ---------------------------------------------------------------- public

/**
 * Resolve free text to coordinates.
 * Results are cached for 30 days in the main table (TTL attribute), which keeps the call count
 * low and matches the free providers' expectations. Empty results are not cached.
 */
export async function geocode(rawQuery: unknown, deps: GeocodeDeps): Promise<GeoCandidate[]> {
  const query = typeof rawQuery === 'string' ? rawQuery.trim().replace(/\s+/g, ' ') : ''; // tidy spacing, keep case
  if (query.length < 3 || query.length > 200) throw new AppError('Enter an address of 3 to 200 characters', 400);

  const Key = cacheKey(query);
  const nowSec = Math.floor(deps.now() / 1000);
  const hit = await ddb.send(new GetCommand({ TableName: TABLE(), Key }));
  // DynamoDB deletes expired items lazily, so check the TTL ourselves.
  if (hit.Item && typeof hit.Item.ttl === 'number' && hit.Item.ttl > nowSec) return hit.Item.results as GeoCandidate[];

  const results = await lookup(query, deps);
  if (results.length > 0) {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { ...Key, entity: 'GEO', query: normalizeQuery(query), results, ttl: nowSec + CACHE_DAYS * 86400 },
    }));
  }
  return results;
}
