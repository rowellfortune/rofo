import { Link } from 'react-router-dom';
import type { Pool } from '../types';
import { useListing } from '../hooks/useListings';
import { formatPrice, placeholderImage } from '../lib/format';
import { goalAmount, memberCount, poolStatus, raised } from '../lib/pools';

/** Summary card for one pool: property, progress bar, seats. */
export function PoolCard({ pool }: { pool: Pool }) {
  const { data: l } = useListing(pool.listingId);
  if (!l) return null;
  const goal = goalAmount(l.price);
  const got = raised(pool);
  const pct = Math.min(100, Math.round((got / goal) * 100));
  const seats = pool.maxMembers - memberCount(pool);

  return (
    <Link to={`/pools/${pool.id}`} className="card pool-card">
      <div className="card-img" style={{ backgroundImage: `url("${l.images?.[0] ?? placeholderImage(l.hue, 0, l.type)}")` }}>
        <span className="badge badge-open">{poolStatus(pool, l.price)}</span>
      </div>
      <div className="card-body">
        <div className="card-title">{pool.name}</div>
        <div className="muted small">{l.address}, {l.city} · {formatPrice(l.price, 'buy')}</div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="pool-meta">
          <span><strong>{formatPrice(got, 'buy')}</strong> of {formatPrice(goal, 'buy')}</span>
          <span>{seats > 0 ? `${seats} seat${seats === 1 ? '' : 's'} open` : 'Full'}</span>
        </div>
      </div>
    </Link>
  );
}
