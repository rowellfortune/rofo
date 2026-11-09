import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeListing } from '../test/utils';
import { useListing, useSearch } from './useListings';

vi.mock('../api/config', () => ({ apiEnabled: true, apiConfig: {} }));
const h = vi.hoisted(() => ({ apiSearch: vi.fn(), apiGetListing: vi.fn() }));
vi.mock('../api/listings', () => h);

describe('useSearch (API mode)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('waits 250 ms before searching, then returns the results', async () => {
    const homes = [makeListing()];
    h.apiSearch.mockResolvedValue(homes);
    const { result } = renderHook(() => useSearch(new URLSearchParams('q=Nassau')));
    expect(result.current.loading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(h.apiSearch).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(h.apiSearch).toHaveBeenCalledOnce();
    expect(h.apiSearch.mock.calls[0][0].toString()).toBe('q=Nassau');
    expect(result.current).toEqual({ data: homes, loading: false, error: null });
  });

  test('typing fast sends only the last query (debounce)', async () => {
    h.apiSearch.mockResolvedValue([]);
    const { rerender } = renderHook(({ q }) => useSearch(new URLSearchParams(q)), { initialProps: { q: 'q=N' } });
    rerender({ q: 'q=Na' });
    rerender({ q: 'q=Nas' });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(h.apiSearch).toHaveBeenCalledOnce();
    expect(h.apiSearch.mock.calls[0][0].toString()).toBe('q=Nas');
  });

  test('a slow old reply cannot overwrite a newer one', async () => {
    let finishOld: (v: unknown) => void = () => {};
    h.apiSearch
      .mockImplementationOnce(() => new Promise((r) => { finishOld = r; }))
      .mockResolvedValueOnce([makeListing({ id: 'fresh' })]);
    const { result, rerender } = renderHook(({ q }) => useSearch(new URLSearchParams(q)), { initialProps: { q: 'q=a' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    rerender({ q: 'q=b' });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await act(async () => { finishOld([makeListing({ id: 'stale' })]); });
    expect(result.current.data.map((l) => l.id)).toEqual(['fresh']);
  });

  test('errors are reported with an empty list', async () => {
    h.apiSearch.mockRejectedValue(new Error('Throttled'));
    const { result } = renderHook(() => useSearch(new URLSearchParams()));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(result.current).toEqual({ data: [], loading: false, error: 'Throttled' });
  });
});

describe('useListing (API mode)', () => {
  test('fetches by id', async () => {
    const home = makeListing({ id: 'x1' });
    h.apiGetListing.mockResolvedValue(home);
    const { result } = renderHook(() => useListing('x1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current).toEqual({ data: home, loading: false, error: null }));
    expect(h.apiGetListing).toHaveBeenCalledWith('x1');
  });

  test('no id: no request and not loading', () => {
    h.apiGetListing.mockClear();
    const { result } = renderHook(() => useListing(undefined));
    expect(result.current.loading).toBe(false);
    expect(h.apiGetListing).not.toHaveBeenCalled();
  });

  test('errors are reported', async () => {
    h.apiGetListing.mockRejectedValue(new Error('Not found'));
    const { result } = renderHook(() => useListing('x2'));
    await waitFor(() => expect(result.current.error).toBe('Not found'));
  });
});
