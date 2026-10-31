import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSearch } from '../hooks/useListings';
import { formatPrice } from '../lib/format';
import { goalAmount, monthlyPerMember } from '../lib/pools';
import { usePools } from '../state/PoolsContext';

/** Form to start a pool. The calculator shows the monthly amount live. */
export function NewPool() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { createPool, needsAuth } = usePools();
  const { data: buyable } = useSearch(new URLSearchParams({ deal: 'buy' }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [listingId, setListingId] = useState(params.get('listing') ?? '');
  const [maxMembers, setMaxMembers] = useState(Number(params.get('members')) || 5);
  const [months, setMonths] = useState(Number(params.get('months')) || 24);

  const listing = buyable.find((l) => l.id === listingId) ?? buyable[0];

  if (needsAuth) {
    return (
      <div className="container detail">
        <div className="form-card">
          <h1>Start a pool</h1>
          <p className="muted">Sign in to start or join a pool.</p>
          <Link className="btn btn-primary" to="/login?next=/pools/new">Sign in</Link>
        </div>
      </div>
    );
  }
  if (!listing) return <div className="container detail"><p className="muted">Loading homes...</p></div>;
  const each = monthlyPerMember(listing.price, maxMembers, months);

  /** Create the pool and open it. */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const id = await createPool({
        name: name.trim() || `${listing.city} Home Fund`,
        listingId: listing.id, maxMembers, targetMonths: months, monthly: each,
      });
      navigate(`/pools/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the pool');
    } finally { setBusy(false); }
  };

  return (
    <div className="container detail">
      <h1>Start a pool</h1>
      <form className="form-card" onSubmit={(e) => void submit(e)}>
        <label>Pool name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${listing.city} Home Fund`} maxLength={60} />
        </label>
        <label>Home
          <select value={listing.id} onChange={(e) => setListingId(e.target.value)}>
            {buyable.map((l) => <option key={l.id} value={l.id}>{l.address}, {l.city} ({formatPrice(l.price, 'buy')})</option>)}
          </select>
        </label>
        <label>Members: <strong>{maxMembers}</strong>
          <input type="range" min={2} max={12} value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} />
        </label>
        <label>Months to save: <strong>{months}</strong>
          <input type="range" min={6} max={60} step={6} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
        </label>
        <div className="pool-each">
          {formatPrice(each, 'buy')} <span>per person, per month</span>
        </div>
        <p className="muted small">
          Goal {formatPrice(goalAmount(listing.price), 'buy')} (20% deposit + 5% costs of {formatPrice(listing.price, 'buy')}).
          Members can agree different amounts later. Ownership follows what each person pays in.
        </p>
        {error && <div className="notice small" role="alert">{error}</div>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create pool'}</button>
      </form>
    </div>
  );
}
