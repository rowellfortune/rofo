import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { listings } from '../data/listings';
import { useListing, useSearch } from './useListings';

// Demo mode: synchronous answers from the mock data, never loading.
describe('useSearch (demo mode)', () => {
  test('no filters returns every listing at once', () => {
    const { result } = renderHook(() => useSearch(new URLSearchParams()));
    expect(result.current).toEqual({ data: listings, loading: false, error: null });
  });

  test('filters apply, and new params give new results', () => {
    const { result, rerender } = renderHook(({ q }) => useSearch(new URLSearchParams(q)), { initialProps: { q: 'deal=rent' } });
    expect(result.current.data.every((l) => l.deal === 'rent')).toBe(true);
    rerender({ q: 'deal=buy' });
    expect(result.current.data.every((l) => l.deal === 'buy')).toBe(true);
  });
});

describe('useListing (demo mode)', () => {
  test('finds by id, undefined for unknown or missing ids', () => {
    expect(renderHook(() => useListing('l1')).result.current.data?.id).toBe('l1');
    expect(renderHook(() => useListing('nope')).result.current.data).toBeUndefined();
    expect(renderHook(() => useListing(undefined)).result.current).toEqual({ data: undefined, loading: false, error: null });
  });
});
