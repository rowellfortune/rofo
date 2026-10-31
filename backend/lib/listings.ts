import { randomUUID } from 'node:crypto';
import {
  BatchGetCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import type { Caller } from '../utils/GraphqlUtil';
import { ddb, TABLE } from './db';
import { favoriteKey, listingIndexKeys, listingKey, slug, stripKeys } from './keys';

/** Validation for create and update. */
export const ListingInput = z.object({
  deal: z.enum(['buy', 'rent']),
  type: z.enum(['House', 'Apartment', 'Villa', 'Land', 'Commercial']),
  title: z.string().trim().min(3).max(140),
  address: z.string().trim().min(3).max(140),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  price: z.number().positive().max(1e10),
  beds: z.number().int().min(0).max(50),
  baths: z.number().int().min(0).max(50),
  areaM2: z.number().int().min(0).max(1e6),
  plotM2: z.number().int().min(0).max(1e8).nullish(),
  yearBuilt: z.number().int().min(1500).max(2100).nullish(),
  isNew: z.boolean().nullish(),
  openHouse: z.string().max(80).nullish(),
  description: z.string().trim().min(10).max(5000),
  features: z.array(z.string().max(60)).max(30).nullish(),
  images: z.array(z.string().max(300)).max(20).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  agency: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(5).max(30),
});
export type ListingInputT = z.infer<typeof ListingInput>;

/** An agent may only attach images they uploaded (keys start with listings/<sub>/). Admins skip this. */
function assertOwnImages(caller: Caller, images: string[] | null | undefined) {
  if (caller.groups.includes('Admin')) return;
  const prefix = `listings/${caller.sub}/`;
  if (images?.some((k) => !k.startsWith(prefix))) throw new AppError('Invalid image key', 400);
}

/** Load a listing or throw 404. */
export async function loadListing(id: string) {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: listingKey(id) }));
  if (!res.Item) throw new AppError('Listing not found', 404);
  return res.Item;
}

/** Only the owner or an Admin may change a listing. */
function assertCanEdit(caller: Caller, item: { agentId: string }) {
  if (item.agentId !== caller.sub && !caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
}

/** Create a listing owned by the caller. */
export async function createListing(caller: Caller, raw: unknown) {
  const input = parseInput(raw);
  assertOwnImages(caller, input.images);
  const now = new Date().toISOString();
  const id = randomUUID();
  const item = {
    ...input,
    id,
    isNew: input.isNew ?? false,
    features: input.features ?? [],
    images: input.images ?? [],
    agentId: caller.sub,
    agentName: caller.name,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({
    TableName: TABLE(),
    Item: { ...listingKey(id), ...listingIndexKeys(item), entity: 'LISTING', ...item },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
  return item;
}

/** Replace a listing's editable fields. Keeps id, owner and createdAt. */
export async function updateListing(caller: Caller, id: string, raw: unknown) {
  const input = parseInput(raw);
  const existing = await loadListing(id);
  assertCanEdit(caller, existing as { agentId: string });
  assertOwnImages(caller, input.images);
  const item = {
    ...input,
    id,
    isNew: input.isNew ?? false,
    features: input.features ?? [],
    images: input.images ?? [],
    agentId: existing.agentId as string,
    agentName: existing.agentName as string,
    createdAt: existing.createdAt as string,
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({
    TableName: TABLE(),
    Item: { ...listingKey(id), ...listingIndexKeys(item), entity: 'LISTING', ...item },
    ConditionExpression: 'attribute_exists(pk)',
  }));
  return item;
}

/** Delete a listing. Favorites pointing at it are skipped on read (see myFavorites). */
export async function deleteListing(caller: Caller, id: string) {
  assertCanEdit(caller, (await loadListing(id)) as { agentId: string });
  await ddb.send(new DeleteCommand({ TableName: TABLE(), Key: listingKey(id) }));
  return true;
}

/** Zod parse with a readable error. */
function parseInput(raw: unknown): ListingInputT {
  const r = ListingInput.safeParse(raw);
  if (!r.success) throw new AppError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  return r.data;
}

// ---------- Search ----------

export interface SearchInput {
  deal: 'buy' | 'rent';
  country?: string | null;
  city?: string | null;
  type?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minBeds?: number | null;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'area_desc' | null;
  limit?: number | null;
  nextToken?: string | null;
}

const encodeToken = (key: Record<string, unknown> | undefined) =>
  key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null;

function decodeToken(token: string | null | undefined) {
  if (!token) return undefined;
  try { return JSON.parse(Buffer.from(token, 'base64url').toString()); }
  catch { throw new AppError('Invalid nextToken', 400); }
}

/**
 * Search listings.
 *  - city + country given: query gsi1 (place + deal)
 *  - otherwise: query gsi2 (deal feed)
 * Type, price and beds are FilterExpressions, which DynamoDB applies AFTER reading.
 * So we keep reading pages until we fill `limit` or run out (max 5 reads).
 * Sorting by price or area only orders the returned page. True price sort needs
 * a price GSI or OpenSearch once the catalogue grows.
 */
export async function searchListings(input: SearchInput) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const byPlace = input.city && input.country;

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const filters: string[] = [];
  if (input.type) { names['#t'] = 'type'; values[':t'] = input.type; filters.push('#t = :t'); }
  if (input.minPrice != null) { names['#p'] = 'price'; values[':minp'] = input.minPrice; filters.push('#p >= :minp'); }
  if (input.maxPrice != null) { names['#p'] = 'price'; values[':maxp'] = input.maxPrice; filters.push('#p <= :maxp'); }
  if (input.minBeds != null) { names['#b'] = 'beds'; values[':minb'] = input.minBeds; filters.push('#b >= :minb'); }

  const base: QueryCommandInput = byPlace
    ? {
        TableName: TABLE(), IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :deal)',
        ExpressionAttributeValues: { ...values, ':pk': `PLACE#${slug(input.country!)}#${slug(input.city!)}`, ':deal': `${input.deal}#` },
      }
    : {
        TableName: TABLE(), IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: { ...values, ':pk': `DEAL#${input.deal}` },
      };
  if (filters.length) { base.FilterExpression = filters.join(' AND '); base.ExpressionAttributeNames = names; }

  const items: Record<string, unknown>[] = [];
  let startKey = decodeToken(input.nextToken);
  for (let i = 0; i < 5 && items.length < limit; i++) {
    const res = await ddb.send(new QueryCommand({
      ...base, ScanIndexForward: false, Limit: limit * 2, ExclusiveStartKey: startKey,
    }));
    items.push(...(res.Items ?? []));
    startKey = res.LastEvaluatedKey;
    if (!startKey) break;
  }

  // Return exactly `limit` items. If we over-read, the token must restart after the last returned item.
  const page = items.slice(0, limit);
  let next: Record<string, unknown> | undefined = startKey;
  if (items.length > limit) {
    const last = page[page.length - 1] as Record<string, string>;
    next = byPlace
      ? { pk: last.pk, sk: last.sk, gsi1pk: last.gsi1pk, gsi1sk: last.gsi1sk }
      : { pk: last.pk, sk: last.sk, gsi2pk: last.gsi2pk, gsi2sk: last.gsi2sk };
  }

  const sorters = {
    price_asc: (a: any, b: any) => a.price - b.price,
    price_desc: (a: any, b: any) => b.price - a.price,
    area_desc: (a: any, b: any) => b.areaM2 - a.areaM2,
  } as const;
  if (input.sortBy && input.sortBy !== 'newest') page.sort(sorters[input.sortBy]);

  return { items: page.map(stripKeys), nextToken: encodeToken(next) };
}

/** All listings owned by the caller (gsi3). */
export async function myListings(caller: Caller) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE(), IndexName: 'gsi3',
    KeyConditionExpression: 'gsi3pk = :pk',
    ExpressionAttributeValues: { ':pk': `AGENT#${caller.sub}` },
    ScanIndexForward: false,
  }));
  return (res.Items ?? []).map(stripKeys);
}

// ---------- Favorites ----------

/** Add or remove a favorite. Returns true when the listing is now saved. */
export async function toggleFavorite(caller: Caller, listingId: string) {
  await loadListing(listingId); // 404 if it does not exist
  const Key = favoriteKey(caller.sub, listingId);
  const existing = await ddb.send(new GetCommand({ TableName: TABLE(), Key }));
  if (existing.Item) {
    await ddb.send(new DeleteCommand({ TableName: TABLE(), Key }));
    return false;
  }
  await ddb.send(new PutCommand({
    TableName: TABLE(),
    Item: { ...Key, entity: 'FAVORITE', listingId, createdAt: new Date().toISOString() },
  }));
  return true;
}

/** The caller's saved listings. Skips favorites whose listing was deleted. */
export async function myFavorites(caller: Caller) {
  const favs = await ddb.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :fav)',
    ExpressionAttributeValues: { ':pk': `USER#${caller.sub}`, ':fav': 'FAV#' },
    Limit: 100,
  }));
  const ids = (favs.Items ?? []).map((f) => f.listingId as string);
  if (!ids.length) return [];
  const got = await ddb.send(new BatchGetCommand({
    RequestItems: { [TABLE()]: { Keys: ids.map(listingKey) } },
  }));
  return (got.Responses?.[TABLE()] ?? []).map(stripKeys);
}
