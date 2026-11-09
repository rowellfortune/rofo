import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, userWith } from '../test/mocks';
import { makePool } from '../test/utils';
import { PoolsProvider, usePools } from './PoolsContext';

// API mode: AppSync calls and the auth context are replaced.
vi.mock('../api/config', () => ({ apiEnabled: true, apiConfig: {} }));
const h = vi.hoisted(() => ({
  auth: {} as ReturnType<typeof import('../test/mocks').authValue>,
  api: {
    apiListPools: vi.fn(), apiMyPools: vi.fn(), apiGetPool: vi.fn(), apiCreatePool: vi.fn(), apiJoinPool: vi.fn(),
    apiLeavePool: vi.fn(), apiVote: vi.fn(), apiCreateProposal: vi.fn(), apiRecordContribution: vi.fn(), apiReverseContribution: vi.fn(),
  },
}));
vi.mock('../api/pools', () => h.api);
vi.mock('./AuthContext', () => ({ useAuth: () => h.auth }));

const summary = (over = {}) => makePool({ members: [], ledger: [], summary: { raised: 800, goal: 1000, memberCount: 2, viewerIsMember: false }, ...over });
const full = makePool();

beforeEach(() => {
  h.auth = authValue({ user: userWith(['Client'], { sub: 'u1' }) });
  h.api.apiListPools.mockResolvedValue([summary()]);
  h.api.apiMyPools.mockResolvedValue([]);
  h.api.apiGetPool.mockResolvedValue(full);
  for (const k of ['apiJoinPool', 'apiLeavePool', 'apiVote', 'apiCreateProposal', 'apiRecordContribution', 'apiReverseContribution'] as const) {
    h.api[k].mockResolvedValue(undefined);
  }
  h.api.apiCreatePool.mockResolvedValue('p1');
});

const wrapper = ({ children }: { children: ReactNode }) => <PoolsProvider>{children}</PoolsProvider>;
async function mount() {
  const r = renderHook(() => usePools(), { wrapper }).result;
  await waitFor(() => expect(r.current.pools.length).toBeGreaterThan(0));
  return r;
}

describe('PoolsProvider (API mode)', () => {
  test('signed out: needs auth and calls nothing', async () => {
    h.auth = authValue();
    const r = renderHook(() => usePools(), { wrapper }).result;
    expect(r.current.needsAuth).toBe(true);
    expect(r.current.meId).toBeNull();
    await r.current.loadPool('p1');
    expect(h.api.apiListPools).not.toHaveBeenCalled();
    expect(h.api.apiGetPool).not.toHaveBeenCalled();
  });

  test('signed in: lists all and my pools, uses my user id, never self pay', async () => {
    const r = await mount();
    expect(h.api.apiListPools).toHaveBeenCalledOnce();
    expect(h.api.apiMyPools).toHaveBeenCalledOnce();
    expect(r.current).toMatchObject({ needsAuth: false, meId: 'u1', canSelfPay: false });
  });

  test('pools are sorted newest first', async () => {
    h.api.apiListPools.mockResolvedValue([summary({ id: 'old', createdAt: '2025-01-01T00:00:00Z' }), summary({ id: 'new', createdAt: '2026-05-01T00:00:00Z' })]);
    const r = await mount();
    expect(r.current.pools.map((p) => p.id)).toEqual(['new', 'old']);
  });

  test('a later summary does not wipe member detail already loaded', async () => {
    const r = await mount();
    await act(() => r.current.loadPool('p1'));
    expect(r.current.pools[0].members).toHaveLength(2);
    // Joining reloads the pool. If that reload returned a summary, the members stay.
    h.api.apiGetPool.mockResolvedValueOnce(summary());
    await act(() => r.current.joinPool('p1', 100));
    expect(h.api.apiJoinPool).toHaveBeenCalledWith('p1', 100);
    expect(r.current.pools[0].members).toHaveLength(2);
    expect(r.current.pools[0].summary?.raised).toBe(800);
  });

  test('each action calls its API and reloads the pool', async () => {
    const r = await mount();
    h.api.apiGetPool.mockClear();
    await act(async () => {
      await r.current.leavePool('p1');
      await r.current.vote('p1', 'pr1', 'no');
      await r.current.createProposal('p1', { title: 'T', detail: 'D' });
      await r.current.recordContribution('p1', { userId: 'u2', amount: 50, reference: 'R9' });
      await r.current.reverseContribution('p1', 'e1', 'Bounced');
    });
    expect(h.api.apiLeavePool).toHaveBeenCalledWith('p1');
    expect(h.api.apiVote).toHaveBeenCalledWith('p1', 'pr1', 'no');
    expect(h.api.apiCreateProposal).toHaveBeenCalledWith('p1', { title: 'T', detail: 'D' });
    expect(h.api.apiRecordContribution).toHaveBeenCalledWith('p1', { userId: 'u2', amount: 50, reference: 'R9' });
    expect(h.api.apiReverseContribution).toHaveBeenCalledWith('p1', 'e1', 'Bounced');
    expect(h.api.apiGetPool).toHaveBeenCalledTimes(5);
  });

  test('createPool returns the new id after loading it', async () => {
    const r = await mount();
    let id = '';
    await act(async () => { id = await r.current.createPool({ name: 'F', listingId: 'l1', maxMembers: 4, targetMonths: 12, monthly: 100 }); });
    expect(id).toBe('p1');
    expect(h.api.apiGetPool).toHaveBeenCalledWith('p1');
  });

  test('a failed action sets the banner, rethrows, and clearError removes it', async () => {
    h.api.apiVote.mockRejectedValue(new Error('Voting closed'));
    const r = await mount();
    let thrown: unknown;
    await act(async () => { await r.current.vote('p1', 'pr1', 'yes').catch((e) => { thrown = e; }); });
    expect((thrown as Error).message).toBe('Voting closed');
    expect(r.current.error).toBe('Voting closed');
    act(() => r.current.clearError());
    expect(r.current.error).toBeNull();
  });

  test('self payment is refused with the escrow explanation', async () => {
    const r = await mount();
    await act(async () => { await r.current.contribute('p1').catch(() => {}); });
    expect(r.current.error).toMatch(/confirmed through escrow/);
  });

  test('a failed list load shows the error', async () => {
    h.api.apiListPools.mockRejectedValue(new Error('AppSync down'));
    const r = renderHook(() => usePools(), { wrapper }).result;
    await waitFor(() => expect(r.current.error).toBe('AppSync down'));
    expect(r.current.loading).toBe(false);
  });

  test('admin tools need both the Admin group and MFA on', async () => {
    h.auth = authValue({ user: userWith(['Admin'], { sub: 'a1' }), adminMfa: 'missing' });
    const locked = await mount();
    expect(locked.current.isAdmin).toBe(false);
    h.auth = authValue({ user: userWith(['Admin'], { sub: 'a1' }), adminMfa: 'ok' });
    const open = await mount();
    expect(open.current.isAdmin).toBe(true);
  });
});
