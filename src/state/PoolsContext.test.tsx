import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { seedPools } from '../data/pools';
import { makePool } from '../test/utils';
import { ME, PoolsProvider, usePools } from './PoolsContext';

// Demo mode: pools live in localStorage. Auth is never consulted, so it is not mocked.
const KEY = 'rofo.pools.v1';
const wrapper = ({ children }: { children: ReactNode }) => <PoolsProvider>{children}</PoolsProvider>;
const mount = () => renderHook(() => usePools(), { wrapper }).result;
const mine = (over = {}) => makePool({ members: [...makePool().members, { id: ME.id, name: ME.name, monthly: 100, contributed: 0, joinedAt: '2026-03-01' }], ...over });
const save = (pools: unknown) => localStorage.setItem(KEY, JSON.stringify(pools));
const pool = (r: ReturnType<typeof mount>, id = 'p1') => r.current.pools.find((p) => p.id === id)!;

beforeEach(() => { localStorage.clear(); });

describe('PoolsProvider (demo mode)', () => {
  test('starts from the seed pools and saves changes to the browser', async () => {
    const r = mount();
    expect(r.current.pools).toEqual(seedPools);
    expect(r.current).toMatchObject({ needsAuth: false, meId: 'me', canSelfPay: true, isAdmin: false, loading: false, error: null });
    await act(() => r.current.joinPool(seedPools[1].id, 150));
    expect(JSON.parse(localStorage.getItem(KEY)!)[1].members.some((m: { id: string }) => m.id === 'me')).toBe(true);
  });

  test('corrupt storage falls back to the seed pools', () => {
    localStorage.setItem(KEY, '{not json');
    expect(mount().current.pools).toEqual(seedPools);
  });

  test('createPool puts the new pool first with me as the only member', async () => {
    save([makePool()]);
    const r = mount();
    let id = '';
    await act(async () => { id = await r.current.createPool({ name: 'Fund', listingId: 'l1', maxMembers: 5, targetMonths: 24, monthly: 300 }); });
    expect(r.current.pools[0].id).toBe(id);
    expect(r.current.pools[0].members).toEqual([expect.objectContaining({ id: 'me', monthly: 300, contributed: 0 })]);
  });

  test('join: once only, and not into a full pool', async () => {
    save([makePool({ maxMembers: 3 }), makePool({ id: 'full', maxMembers: 2 })]);
    const r = mount();
    await act(() => r.current.joinPool('p1', 120));
    await act(() => r.current.joinPool('p1', 120));
    expect(pool(r).members.filter((m) => m.id === 'me')).toHaveLength(1);
    await act(() => r.current.joinPool('full', 120));
    expect(pool(r, 'full').members).toHaveLength(2);
  });

  test('leave only while nothing is paid in', async () => {
    save([mine()]);
    const r = mount();
    await act(() => r.current.contribute('p1'));
    await act(() => r.current.leavePool('p1'));
    expect(pool(r).members.some((m) => m.id === 'me')).toBe(true);
    save([mine()]);
    const r2 = mount();
    await act(() => r2.current.leavePool('p1'));
    expect(pool(r2).members.some((m) => m.id === 'me')).toBe(false);
  });

  test('contribute adds my monthly amount and a ledger line', async () => {
    save([mine()]);
    const r = mount();
    await act(() => r.current.contribute('p1'));
    expect(pool(r).members.find((m) => m.id === 'me')!.contributed).toBe(100);
    expect(pool(r).ledger[0]).toMatchObject({ memberId: 'me', amount: 100 });
  });

  test('non-members cannot pay, vote or propose', async () => {
    save([makePool({ proposals: [{ id: 'pr1', title: 'Offer', detail: '', votes: {} }] })]);
    const r = mount();
    const before = pool(r);
    await act(() => r.current.contribute('p1'));
    await act(() => r.current.vote('p1', 'pr1', 'yes'));
    await act(() => r.current.createProposal('p1', { title: 'X', detail: 'Y' }));
    expect(pool(r)).toEqual(before);
  });

  test('members vote and propose; a second vote replaces the first', async () => {
    save([mine({ proposals: [{ id: 'pr1', title: 'Offer', detail: '', votes: {} }] })]);
    const r = mount();
    await act(() => r.current.vote('p1', 'pr1', 'yes'));
    await act(() => r.current.vote('p1', 'pr1', 'no'));
    expect(pool(r).proposals[0].votes).toEqual({ me: 'no' });
    await act(() => r.current.createProposal('p1', { title: 'Hire a surveyor', detail: '450 USD' }));
    expect(pool(r).proposals[0]).toMatchObject({ title: 'Hire a surveyor', votes: {} });
  });

  test('admin payment tools need the live backend', async () => {
    const r = mount();
    await expect(r.current.recordContribution('p1', { userId: 'u1', amount: 1, reference: 'R' })).rejects.toThrow('live backend');
    await expect(r.current.reverseContribution('p1', 'e1', 'oops')).rejects.toThrow('live backend');
  });

  test('usePools outside the provider fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePools())).toThrow('usePools must be used inside PoolsProvider');
  });
});
