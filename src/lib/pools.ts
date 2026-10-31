import type { Pool, PoolMember, Proposal } from '../types';

/** Share of the price the group must raise: 20% deposit plus 5% closing costs. */
export const GOAL_RATE = 0.25;
/** Votes needed to pass: more than half of members. */
export const quorum = (members: number): number => Math.floor(members / 2) + 1;

/** Cash the group must raise to buy a property at this price. */
export const goalAmount = (price: number): number => Math.round(price * GOAL_RATE);

/** Monthly amount per member to hit the goal in `months` with `members` people. */
export function monthlyPerMember(price: number, members: number, months: number): number {
  if (members < 1 || months < 1) return 0;
  return Math.ceil(goalAmount(price) / members / months);
}

/** Total paid in by all members. Uses the server total when members are hidden. */
export const raised = (pool: Pool): number =>
  pool.summary?.raised ?? pool.members.reduce((s, m) => s + m.contributed, 0);

/** Seats taken. Uses the server count when the member list is hidden. */
export const memberCount = (pool: Pool): number => pool.summary?.memberCount ?? pool.members.length;

/** Total monthly commitment across members. */
export const monthlyTotal = (pool: Pool): number => pool.members.reduce((s, m) => s + m.monthly, 0);

/**
 * Ownership share in percent. Proportional to what each member paid in,
 * so someone who contributes more owns more. Equal split before any payment.
 */
export function sharePct(pool: Pool, member: PoolMember): number {
  const total = raised(pool);
  if (total <= 0) return 100 / Math.max(pool.members.length, 1);
  return (member.contributed / total) * 100;
}

/** Months left at the current monthly pace. Infinity if nobody pays monthly. */
export function monthsLeft(pool: Pool, price: number): number {
  const left = Math.max(goalAmount(price) - raised(pool), 0);
  const pace = monthlyTotal(pool);
  if (left === 0) return 0;
  return pace > 0 ? Math.ceil(left / pace) : Infinity;
}

/** Pool status label from progress and seats. */
export function poolStatus(pool: Pool, price: number): 'Forming' | 'Saving' | 'Ready to buy' {
  if (raised(pool) >= goalAmount(price)) return 'Ready to buy';
  return memberCount(pool) < pool.maxMembers ? 'Forming' : 'Saving';
}

/** Vote tally for one proposal. API pools bring a server tally. Demo pools count the votes map. */
export function proposalView(pool: Pool, pr: Proposal, meId: string | null) {
  if (pr.tally) return pr.tally;
  const yes = Object.values(pr.votes).filter((v) => v === 'yes').length;
  const no = Object.values(pr.votes).filter((v) => v === 'no').length;
  const needed = quorum(pool.members.length);
  const status = yes >= needed ? 'PASSED' : no > pool.members.length - needed ? 'REJECTED' : 'OPEN';
  return { yes, no, needed, status: status as 'PASSED' | 'REJECTED' | 'OPEN', myVote: meId ? pr.votes[meId] ?? null : null };
}
