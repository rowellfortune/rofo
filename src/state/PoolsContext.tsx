import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Pool } from '../types';
import { seedPools } from '../data/pools';
import { apiEnabled } from '../api/config';
import {
  apiCreatePool, apiCreateProposal, apiGetPool, apiJoinPool, apiLeavePool, apiListPools, apiMyPools, apiRecordContribution,
  apiReverseContribution, apiVote,
} from '../api/pools';
import { isAdmin as inAdminGroup } from '../components/RequireAgent';
import { useAuth } from './AuthContext';

/** The demo user. API mode uses the Cognito user id instead. */
export const ME = { id: 'me', name: 'You' };

/** Same interface for demo and API mode, so pages do not care which one runs. */
interface PoolsApi {
  pools: Pool[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** API mode and signed out: pools need a login. */
  needsAuth: boolean;
  /** Id of the current user, or null when signed out. */
  meId: string | null;
  /** Demo only. Real contributions are confirmed by escrow, so members cannot pay themselves. */
  canSelfPay: boolean;
  /** True for admins (API mode). They record and reverse payments. */
  isAdmin: boolean;
  /** Fetch one pool in full (members, ledger, votes). No-op in demo mode. */
  loadPool: (id: string) => Promise<void>;
  createPool: (p: { name: string; listingId: string; maxMembers: number; targetMonths: number; monthly: number }) => Promise<string>;
  joinPool: (poolId: string, monthly: number) => Promise<void>;
  leavePool: (poolId: string) => Promise<void>;
  contribute: (poolId: string) => Promise<void>;
  vote: (poolId: string, proposalId: string, choice: 'yes' | 'no') => Promise<void>;
  createProposal: (poolId: string, p: { title: string; detail: string }) => Promise<void>;
  /** Admin: record a confirmed payment. Not available in demo mode. */
  recordContribution: (poolId: string, p: { userId: string; amount: number; reference: string; note?: string }) => Promise<void>;
  /** Admin: reverse a recorded payment. Not available in demo mode. */
  reverseContribution: (poolId: string, entryId: string, reason: string) => Promise<void>;
}

const Ctx = createContext<PoolsApi | null>(null);
const KEY = 'rofo.pools.v1';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

// ---------------------------------------------------------------- demo mode

/** Load pools from localStorage, falling back to the seed data. */
function loadLocal(): Pool[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Pool[];
  } catch { /* ignore corrupt storage */ }
  return seedPools;
}

/** Demo pools kept in the browser. No network. */
function DemoPools({ children }: { children: ReactNode }) {
  const [pools, setPools] = useState<Pool[]>(loadLocal);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(pools)); }, [pools]);

  const patch = useCallback((id: string, fn: (p: Pool) => Pool) => {
    setPools((all) => all.map((p) => (p.id === id ? fn(p) : p)));
  }, []);

  const api = useMemo<PoolsApi>(() => ({
    pools, loading: false, error: null, clearError: () => {}, needsAuth: false, meId: ME.id, canSelfPay: true, isAdmin: false,
    loadPool: async () => {},
    createPool: async ({ name, listingId, maxMembers, targetMonths, monthly }) => {
      const id = `p${Date.now()}`;
      const now = new Date().toISOString();
      setPools((all) => [{
        id, name, listingId, maxMembers, targetMonths, createdAt: now,
        members: [{ ...ME, monthly, contributed: 0, joinedAt: now.slice(0, 10) }], ledger: [], proposals: [],
      }, ...all]);
      return id;
    },
    joinPool: async (poolId, monthly) => patch(poolId, (p) => {
      if (p.members.some((m) => m.id === ME.id) || p.members.length >= p.maxMembers) return p;
      return { ...p, members: [...p.members, { ...ME, monthly, contributed: 0, joinedAt: new Date().toISOString().slice(0, 10) }] };
    }),
    // Members with money in the pool cannot just leave. That needs the exit rules in the agreement.
    leavePool: async (poolId) => patch(poolId, (p) => {
      const me = p.members.find((m) => m.id === ME.id);
      if (!me || me.contributed > 0) return p;
      return { ...p, members: p.members.filter((m) => m.id !== ME.id) };
    }),
    contribute: async (poolId) => patch(poolId, (p) => {
      const me = p.members.find((m) => m.id === ME.id);
      if (!me) return p;
      const date = new Date().toISOString().slice(0, 10);
      return {
        ...p,
        members: p.members.map((m) => (m.id === ME.id ? { ...m, contributed: m.contributed + m.monthly } : m)),
        ledger: [{ id: `e${Date.now()}`, memberId: ME.id, amount: me.monthly, date, note: 'Monthly contribution (demo)' }, ...p.ledger],
      };
    }),
    vote: async (poolId, proposalId, choice) => patch(poolId, (p) => {
      if (!p.members.some((m) => m.id === ME.id)) return p;
      return { ...p, proposals: p.proposals.map((pr) => (pr.id === proposalId ? { ...pr, votes: { ...pr.votes, [ME.id]: choice } } : pr)) };
    }),
    createProposal: async (poolId, { title, detail }) => patch(poolId, (p) => {
      if (!p.members.some((m) => m.id === ME.id)) return p;
      return { ...p, proposals: [{ id: `pr${Date.now()}`, title, detail, votes: {} }, ...p.proposals] };
    }),
    recordContribution: async () => { throw new Error('Recording payments needs the live backend.'); },
    reverseContribution: async () => { throw new Error('Reversing payments needs the live backend.'); },
  }), [pools, patch]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------- API mode

/** Pools from AppSync. Needs a signed-in user (the pool queries are Cognito only). */
function ApiPools({ children }: { children: ReactNode }) {
  const { user, adminMfa } = useAuth();
  // Payment controls are admin tools, so they stay hidden until two step verification is on.
  const admin = inAdminGroup(user?.groups) && adminMfa === 'ok';
  const [byId, setById] = useState<Record<string, Pool>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sub = user?.sub ?? null;

  /** Merge fresh pools in. Keep member detail already loaded when the new copy is a summary. */
  const merge = useCallback((fresh: Pool[]) => {
    setById((prev) => {
      const next = { ...prev };
      for (const p of fresh) {
        const old = prev[p.id];
        next[p.id] = p.members.length === 0 && old?.members.length
          ? { ...p, members: old.members, ledger: old.ledger, proposals: old.proposals }
          : p;
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!sub) { setById({}); return; }
    setLoading(true);
    try {
      const [all, mine] = await Promise.all([apiListPools(), apiMyPools()]);
      merge([...all, ...mine]);
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [sub, merge]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadPool = useCallback(async (id: string) => {
    if (!sub) return;
    try { merge([await apiGetPool(id)]); } catch (e) { setError(errMsg(e)); }
  }, [sub, merge]);

  /** Run a mutation. Failures show in the banner and rethrow so forms can react. */
  const act = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (e) { setError(errMsg(e)); throw e; }
  }, []);

  const api = useMemo<PoolsApi>(() => ({
    pools: Object.values(byId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    loading, error, clearError: () => setError(null), needsAuth: !sub, meId: sub, canSelfPay: false, isAdmin: admin,
    loadPool,
    createPool: (input) => act(async () => { const id = await apiCreatePool(input); await loadPool(id); return id; }),
    joinPool: (id, monthly) => act(async () => { await apiJoinPool(id, monthly); await loadPool(id); }),
    leavePool: (id) => act(async () => { await apiLeavePool(id); await loadPool(id); }),
    contribute: () => act(async () => { throw new Error('Contributions are confirmed through escrow, not from the app.'); }),
    vote: (id, proposalId, choice) => act(async () => { await apiVote(id, proposalId, choice); await loadPool(id); }),
    createProposal: (id, p) => act(async () => { await apiCreateProposal(id, p); await loadPool(id); }),
    recordContribution: (id, p) => act(async () => { await apiRecordContribution(id, p); await loadPool(id); }),
    reverseContribution: (id, entryId, reason) => act(async () => { await apiReverseContribution(id, entryId, reason); await loadPool(id); }),
  }), [byId, loading, error, sub, admin, loadPool, act]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Picks demo or API pools from the environment. */
export function PoolsProvider({ children }: { children: ReactNode }) {
  return apiEnabled ? <ApiPools>{children}</ApiPools> : <DemoPools>{children}</DemoPools>;
}

/** Access pool state and actions. */
export function usePools(): PoolsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePools must be used inside PoolsProvider');
  return v;
}
