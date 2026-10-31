import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listings } from '../data/listings';
import { ListingCard } from '../components/ListingCard';
import { MockMap } from '../components/MockMap';
import type { Listing } from '../types';

/** Apply URL filters to the listing array. */
function applyFilters(params: URLSearchParams): Listing[] {
  const deal = params.get('deal');
  const q = (params.get('q') ?? '').toLowerCase();
  const type = params.get('type') ?? '';
  const min = Number(params.get('min') || 0);
  const max = Number(params.get('max') || Infinity);
  const beds = Number(params.get('beds') || 0);
  const sort = params.get('sort') ?? 'newest';

  const out = listings.filter((l) => {
    if (deal && l.deal !== deal) return false;
    if (type && l.type !== type) return false;
    if (l.price < min || l.price > max) return false;
    if (beds && l.beds < beds) return false;
    if (q && !`${l.city} ${l.country} ${l.address} ${l.title}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (sort === 'price-asc') out.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') out.sort((a, b) => b.price - a.price);
  if (sort === 'area-desc') out.sort((a, b) => b.areaM2 - a.areaM2);
  return out;
}

/** Results page: filters, list and map. State lives in the URL so links are shareable. */
export function Results() {
  const [params, setParams] = useSearchParams();
  const [hover, setHover] = useState<string | null>(null);
  const items = useMemo(() => applyFilters(params), [params]);

  /** Update one query param, or remove it when empty. */
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="results">
      <div className="filters">
        <div className="container filters-inner">
          <input
            className="f-input"
            placeholder="City, country or address"
            value={params.get('q') ?? ''}
            onChange={(e) => set('q', e.target.value)}
            aria-label="Location"
          />
          <select value={params.get('deal') ?? ''} onChange={(e) => set('deal', e.target.value)} aria-label="Buy or rent">
            <option value="">Buy and rent</option>
            <option value="buy">Buy</option>
            <option value="rent">Rent</option>
          </select>
          <select value={params.get('type') ?? ''} onChange={(e) => set('type', e.target.value)} aria-label="Property type">
            <option value="">Any type</option>
            {['House', 'Apartment', 'Villa', 'Land', 'Commercial'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="f-num" type="number" min="0" placeholder="Min price" value={params.get('min') ?? ''} onChange={(e) => set('min', e.target.value)} aria-label="Minimum price" />
          <input className="f-num" type="number" min="0" placeholder="Max price" value={params.get('max') ?? ''} onChange={(e) => set('max', e.target.value)} aria-label="Maximum price" />
          <select value={params.get('beds') ?? ''} onChange={(e) => set('beds', e.target.value)} aria-label="Bedrooms">
            <option value="">Any beds</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+ beds</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>Clear</button>
        </div>
      </div>

      <div className="container results-body">
        <div className="results-list">
          <div className="results-head">
            <h1>{items.length} {items.length === 1 ? 'property' : 'properties'}</h1>
            <select value={params.get('sort') ?? 'newest'} onChange={(e) => set('sort', e.target.value)} aria-label="Sort">
              <option value="newest">Newest</option>
              <option value="price-asc">Price, low to high</option>
              <option value="price-desc">Price, high to low</option>
              <option value="area-desc">Largest area</option>
            </select>
          </div>
          {items.length === 0 && <p className="empty">No results. Try removing a filter.</p>}
          {items.map((l) => (
            <ListingCard key={l.id} listing={l} layout="row" highlighted={hover === l.id} onHover={setHover} />
          ))}
        </div>
        <aside className="results-map">
          <MockMap items={items} activeId={hover} onHover={setHover} />
        </aside>
      </div>
    </div>
  );
}
