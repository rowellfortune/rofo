import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Pool } from '../types';
import { seedPools } from '../data/pools';

/** The signed-in demo user. Replace with Cognito identity later. */
export const ME = { id: 'me', name: 'You' };

const KEY = 'rofo.pools.v1';

interface PoolsApi {
  pools: Pool[];
  createPool: (p: { name: string; listingId: string; maxMembers: number; targetMonths: number; monthly: number }) => string;
  joinPool: (poolId: string, monthly: number) => void;
  leavePool: (poolId: string) => void;
  contribute: (poolId: string) => void;
  vote: (poolId: string, proposalId: string, choice: 'yes' | 'no') => void;
}

const Ctx = createContext<PoolsApi | null>(null);

/** Load pools from localStorage, falling back to the seed data. */
function load(): Pool[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Pool[];
  } catch { /* ignore corrupt storage */ }
  return seedPools;
}

/** Holds pool state for the demo and saves it in the browser. */
export function PoolsProvider({ children }: { children: ReactNode }) {
  const [pools, setPools] = useState<Pool[]>(load);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(pools)); }, [pools]);

  /** Update one pool by id. */
  const patch = useCallback((id: string, fn: (p: Pool) => Pool) => {
    setPools((all) => all.map((p) => (p.id === id ? fn(p) : p)));
  }, []);

  const api = useMemo<PoolsApi>(() => ({
    pools,
    createPool: ({ name, listingId, maxMembers, targetMonths, monthly }) => {
      const id = `p${Date.now()}`;
      const now = new Date().toISOString();
      setPools((all) => [{
        id, name, listingId, maxMembers, targetMonths, createdAt: now,
        members: [{ ...ME, monthly, contributed: 0, joinedAt: now.slice(0, 10) }],
        ledger: [], proposals: [],
      }, ...all]);
      return id;
    },
    joinPool: (poolId, monthly) => patch(poolId, (p) => {
      if (p.members.some((m) => m.id === ME.id) || p.members.length >= p.maxMembers) return p;
      return { ...p, members: [...p.members, { ...ME, monthly, contributed: 0, joinedAt: new Date().toISOString().slice(0, 10) }] };
    }),
    // Members with money in the pool cannot just leave. That needs the exit rules in the agreement.
    leavePool: (poolId) => patch(poolId, (p) => {
      const me = p.members.find((m) => m.id === ME.id);
      if (!me || me.contributed > 0) return p;
      return { ...p, members: p.members.filter((m) => m.id !== ME.id) };
    }),
    // Demo only: records the monthly amount. No real payment happens.
    contribute: (poolId) => patch(poolId, (p) => {
      const me = p.members.find((m) => m.id === ME.id);
      if (!me) return p;
      const date = new Date().toISOString().slice(0, 10);
      return {
        ...p,
        members: p.members.map((m) => (m.id === ME.id ? { ...m, contributed: m.contributed + m.monthly } : m)),
        ledger: [{ id: `e${Date.now()}`, memberId: ME.id, amount: me.monthly, date, note: 'Monthly contribution (demo)' }, ...p.ledger],
      };
    }),
    vote: (poolId, proposalId, choice) => patch(poolId, (p) => {
      if (!p.members.some((m) => m.id === ME.id)) return p;
      return { ...p, proposals: p.proposals.map((pr) => (pr.id === proposalId ? { ...pr, votes: { ...pr.votes, [ME.id]: choice } } : pr)) };
    }),
  }), [pools, patch]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Access pool state and actions. */
export function usePools(): PoolsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePools must be used inside PoolsProvider');
  return v;
}
