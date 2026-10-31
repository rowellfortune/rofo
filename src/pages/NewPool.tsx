import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listings } from '../data/listings';
import { formatPrice } from '../lib/format';
import { goalAmount, monthlyPerMember } from '../lib/pools';
import { usePools } from '../state/PoolsContext';

/** Form to start a pool. The calculator shows the monthly amount live. */
export function NewPool() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { createPool } = usePools();
  const buyable = listings.filter((l) => l.deal === 'buy');

  const [name, setName] = useState('');
  const [listingId, setListingId] = useState(params.get('listing') ?? buyable[0].id);
  const [maxMembers, setMaxMembers] = useState(Number(params.get('members')) || 5);
  const [months, setMonths] = useState(Number(params.get('months')) || 24);

  const listing = buyable.find((l) => l.id === listingId) ?? buyable[0];
  const each = monthlyPerMember(listing.price, maxMembers, months);

  /** Create the pool and open it. */
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = createPool({
      name: name.trim() || `${listing.city} Home Fund`,
      listingId, maxMembers, targetMonths: months, monthly: each,
    });
    navigate(`/pools/${id}`);
  };

  return (
    <div className="container detail">
      <h1>Start a pool</h1>
      <form className="form-card" onSubmit={submit}>
        <label>Pool name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${listing.city} Home Fund`} maxLength={60} />
        </label>
        <label>Home
          <select value={listingId} onChange={(e) => setListingId(e.target.value)}>
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
        <button className="btn btn-primary btn-lg" type="submit">Create pool</button>
      </form>
    </div>
  );
}
