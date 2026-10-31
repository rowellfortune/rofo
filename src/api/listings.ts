import type { Listing } from '../types';
import { matchesText, readFilters, sortListings } from '../lib/filter';
import { toListing, type ApiListing } from './mappers';
import { Q } from './queries';
import { transport } from './transport';

/** Server sort names use underscores. "newest" is the default order. */
const serverSort: Record<string, string> = { 'price-asc': 'price_asc', 'price-desc': 'price_desc', 'area-desc': 'area_desc' };

/**
 * Search listings from URL filters.
 * The API needs a deal, so "buy and rent" runs two queries and merges them.
 * Free text (city, address) is matched in the browser on up to 50 results per deal.
 * Public queries use identity pool credentials, so guests can search.
 */
export async function apiSearch(params: URLSearchParams): Promise<Listing[]> {
  const f = readFilters(params);
  const deals: ('buy' | 'rent')[] = f.deal ? [f.deal] : ['buy', 'rent'];

  const pages = await Promise.all(
    deals.map((deal) =>
      transport.call<{ items: ApiListing[] }>('searchListings', Q.searchListings, {
        input: {
          deal,
          type: f.type || null,
          minPrice: f.min > 0 ? f.min : null,
          maxPrice: Number.isFinite(f.max) ? f.max : null,
          minBeds: f.beds > 0 ? f.beds : null,
          sortBy: serverSort[f.sort] ?? 'newest',
          limit: 50,
        },
      }, 'identityPool'),
    ),
  );

  const merged = pages.flatMap((p) => p.items.map(toListing)).filter((l) => matchesText(l, f.q));
  return sortListings(merged, f.sort);
}

/** Small cache so cards that show the same listing do not refetch. */
const cache = new Map<string, Promise<Listing | undefined>>();

/** Forget a cached listing (after an edit or delete). */
export const clearListingCache = (id: string): void => { cache.delete(id); };

/** One listing by id (public). Returns undefined if it does not exist. */
export function apiGetListing(id: string): Promise<Listing | undefined> {
  let hit = cache.get(id);
  if (!hit) {
    hit = transport
      .call<ApiListing>('getListing', Q.getListing, { id }, 'identityPool')
      .then(toListing)
      .catch((err: Error) => {
        cache.delete(id); // do not cache failures
        if (/not found/i.test(err.message)) return undefined;
        throw err;
      });
    cache.set(id, hit);
  }
  return hit;
}

/** Ids of the signed-in user's saved listings. */
export async function apiFavoriteIds(): Promise<string[]> {
  const rows = await transport.call<{ id: string }[] | null>('myFavorites', Q.myFavorites, {}, 'userPool');
  return (rows ?? []).map((r) => r.id);
}

/** Save or unsave a listing. Resolves to true when it is now saved. */
export const apiToggleFavorite = (listingId: string) =>
  transport.call<boolean>('toggleFavorite', Q.toggleFavorite, { listingId }, 'userPool');

/** Send an inquiry to the listing's agent (signed in users). */
export const apiSendInquiry = (input: { listingId: string; name: string; email: string; message: string }) =>
  transport.call<{ id: string }>('sendInquiry', Q.sendInquiry, { input }, 'userPool');
