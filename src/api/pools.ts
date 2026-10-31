import type { Pool } from '../types';
import { toPool, type ApiPool } from './mappers';
import { Q } from './queries';
import { transport } from './transport';

/** Open pools, newest first (signed in users). Members stay hidden in summaries. */
export async function apiListPools(): Promise<Pool[]> {
  const page = await transport.call<{ items: ApiPool[] }>('listPools', Q.listPools, {}, 'userPool');
  return page.items.map(toPool);
}

/** Pools the user belongs to. */
export async function apiMyPools(): Promise<Pool[]> {
  const rows = await transport.call<ApiPool[] | null>('myPools', Q.myPools, {}, 'userPool');
  return (rows ?? []).map(toPool);
}

/** One pool. Members see names, shares, ledger and votes. Others see totals only. */
export async function apiGetPool(id: string): Promise<Pool> {
  return toPool(await transport.call<ApiPool>('getPool', Q.getPool, { id }, 'userPool'));
}

export async function apiCreatePool(input: {
  name: string; listingId: string; maxMembers: number; targetMonths: number; monthly: number;
}): Promise<string> {
  const row = await transport.call<{ id: string }>('createPool', Q.createPool, { input }, 'userPool');
  return row.id;
}

export const apiJoinPool = (poolId: string, monthly: number) =>
  transport.call<boolean>('joinPool', Q.joinPool, { poolId, monthly }, 'userPool');

export const apiLeavePool = (poolId: string) =>
  transport.call<boolean>('leavePool', Q.leavePool, { poolId }, 'userPool');

export const apiVote = (poolId: string, proposalId: string, choice: 'yes' | 'no') =>
  transport.call<boolean>('votePoolProposal', Q.votePoolProposal, { poolId, proposalId, choice }, 'userPool');
