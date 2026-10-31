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

/** A member proposes a decision for the group to vote on. */
export const apiCreateProposal = (poolId: string, input: { title: string; detail: string }) =>
  transport.call<boolean>('createPoolProposal', Q.createPoolProposal, { poolId, input }, 'userPool');

/** Admin: record a payment that escrow or the bank has confirmed. The reference makes retries safe. */
export const apiRecordContribution = (poolId: string, p: { userId: string; amount: number; reference: string; note?: string }) =>
  transport.call<boolean>('recordPoolContribution', Q.recordPoolContribution, { poolId, userId: p.userId, amount: p.amount, reference: p.reference, note: p.note || null }, 'userPool');

/** Admin: undo a recorded payment. The original stays in the ledger, marked reversed. */
export const apiReverseContribution = (poolId: string, entryId: string, reason: string) =>
  transport.call<boolean>('reversePoolContribution', Q.reversePoolContribution, { poolId, entryId, reason }, 'userPool');
