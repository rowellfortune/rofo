import { formatPrice } from '../../lib/format';
import type { LedgerEntry, PoolMember } from '../../types';

/** The member's own numbers: what they committed, paid in, and when they last paid. Facts only. */
export function MyContributions({ me, share, ledger }: { me: PoolMember; share: number; ledger: LedgerEntry[] }) {
  // Last real payment: positive, not reversed.
  const last = ledger.find((e) => e.memberId === me.id && e.amount > 0 && !e.reversedAt);
  const payments = ledger.filter((e) => e.memberId === me.id && e.amount > 0 && !e.reversedAt).length;
  return (
    <dl className="mine">
      <div><dt>Paid in</dt><dd>{formatPrice(me.contributed, 'buy')}</dd></div>
      <div><dt>Your share</dt><dd>{share.toFixed(1)}%</dd></div>
      <div><dt>Monthly commitment</dt><dd>{formatPrice(me.monthly, 'buy')}</dd></div>
      <div><dt>Payments</dt><dd>{payments}{last ? ` · last ${last.date}` : ''}</dd></div>
    </dl>
  );
}
