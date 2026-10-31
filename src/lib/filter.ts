import type { Listing } from '../types';

/** Pull typed filters out of the URL query string. */
export function readFilters(params: URLSearchParams) {
  return {
    deal: (params.get('deal') as 'buy' | 'rent' | null) || null,
    q: (params.get('q') ?? '').trim().toLowerCase(),
    type: params.get('type') ?? '',
    min: Number(params.get('min') || 0),
    max: Number(params.get('max') || Infinity),
    beds: Number(params.get('beds') || 0),
    sort: params.get('sort') ?? 'newest',
  };
}
export type ParsedFilters = ReturnType<typeof readFilters>;

/** Free-text match on place and title. The API has no text search, so this runs in the browser. */
export const matchesText = (l: Listing, q: string): boolean =>
  !q || `${l.city} ${l.country} ${l.address} ${l.title}`.toLowerCase().includes(q);

/** Sort in place by the chosen order. "newest" uses createdAt when present, else keeps input order. */
export function sortListings(items: Listing[], sort: string): Listing[] {
  if (sort === 'price-asc') items.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') items.sort((a, b) => b.price - a.price);
  else if (sort === 'area-desc') items.sort((a, b) => b.areaM2 - a.areaM2);
  else if (items.every((l) => l.createdAt)) items.sort((a, b) => b.createdAt!.localeCompare(a.createdAt!));
  return items;
}

/** Filter a full list (demo mode). */
export function filterListings(all: Listing[], params: URLSearchParams): Listing[] {
  const f = readFilters(params);
  const out = all.filter((l) => {
    if (f.deal && l.deal !== f.deal) return false;
    if (f.type && l.type !== f.type) return false;
    if (l.price < f.min || l.price > f.max) return false;
    if (f.beds && l.beds < f.beds) return false;
    return matchesText(l, f.q);
  });
  return sortListings(out, f.sort);
}
