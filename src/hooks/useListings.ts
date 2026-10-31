import { useEffect, useMemo, useState } from 'react';
import { apiEnabled } from '../api/config';
import { apiGetListing, apiSearch } from '../api/listings';
import { listings as mockListings } from '../data/listings';
import { filterListings } from '../lib/filter';
import type { Listing } from '../types';

interface State<T> { data: T; loading: boolean; error: string | null }

/**
 * Listings for a set of URL filters.
 * Demo mode filters the mock array. API mode queries AppSync (debounced, stale replies ignored).
 */
export function useSearch(params: URLSearchParams): State<Listing[]> {
  const key = params.toString();
  const demo = useMemo(() => (apiEnabled ? [] : filterListings(mockListings, new URLSearchParams(key))), [key]);
  const [state, setState] = useState<State<Listing[]>>({ data: [], loading: apiEnabled, error: null });

  useEffect(() => {
    if (!apiEnabled) return;
    let stale = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(() => {
      apiSearch(new URLSearchParams(key))
        .then((data) => { if (!stale) setState({ data, loading: false, error: null }); })
        .catch((e: Error) => { if (!stale) setState({ data: [], loading: false, error: e.message }); });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [key]);

  return apiEnabled ? state : { data: demo, loading: false, error: null };
}

/** One listing by id. Demo mode is synchronous. API mode fetches and caches. */
export function useListing(id: string | undefined): State<Listing | undefined> {
  const [state, setState] = useState<State<Listing | undefined>>({ data: undefined, loading: apiEnabled && !!id, error: null });

  useEffect(() => {
    if (!apiEnabled || !id) return;
    let stale = false;
    setState({ data: undefined, loading: true, error: null });
    apiGetListing(id)
      .then((data) => { if (!stale) setState({ data, loading: false, error: null }); })
      .catch((e: Error) => { if (!stale) setState({ data: undefined, loading: false, error: e.message }); });
    return () => { stale = true; };
  }, [id]);

  if (!apiEnabled) return { data: id ? mockListings.find((l) => l.id === id) : undefined, loading: false, error: null };
  return state;
}
