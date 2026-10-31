import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import { formatPrice } from '../lib/format';
import { goalAmount, monthlyPerMember } from '../lib/pools';
import { usePools } from '../state/PoolsContext';

/** "Buy with a pool" box on the property page. Shows the per-person cost. */
export function PoolBuyPanel({ listing }: { listing: Listing }) {
  const { pools } = usePools();
  const [members, setMembers] = useState(5);
  const [months, setMonths] = useState(24);
  if (listing.deal !== 'buy') return null;

  const existing = pools.filter((p) => p.listingId === listing.id);
  const each = monthlyPerMember(listing.price, members, months);

  return (
    <div className="pool-panel">
      <h3>Buy together</h3>
      <p className="muted small">
        Save the deposit and costs ({formatPrice(goalAmount(listing.price), 'buy')}) with a group.
      </p>
      <label className="slider">Members: <strong>{members}</strong>
        <input type="range" min={2} max={12} value={members} onChange={(e) => setMembers(Number(e.target.value))} />
      </label>
      <label className="slider">Months to save: <strong>{months}</strong>
        <input type="range" min={6} max={60} step={6} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
      </label>
      <div className="pool-each">{formatPrice(each, 'buy')} <span>per person, per month</span></div>
      <p className="muted small">Estimate. Excludes mortgage payments after purchase and legal fees.</p>
      <Link className="btn btn-primary btn-block"
        to={`/pools/new?listing=${listing.id}&members=${members}&months=${months}`}>Start a pool</Link>
      {existing.length > 0 && (
        <div className="pool-existing">
          <strong>{existing.length} open pool{existing.length === 1 ? '' : 's'} for this home</strong>
          {existing.map((p) => <Link key={p.id} to={`/pools/${p.id}`}>{p.name}</Link>)}
        </div>
      )}
    </div>
  );
}
