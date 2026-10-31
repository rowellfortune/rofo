import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Deal } from '../types';

/** Hero search: deal tabs plus a location box. */
export function SearchBar() {
  const navigate = useNavigate();
  const [deal, setDeal] = useState<Deal>('buy');
  const [q, setQ] = useState('');

  /** Send the user to the results page with their query. */
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ deal });
    if (q.trim()) params.set('q', q.trim());
    navigate(`/search?${params.toString()}`);
  };

  return (
    <form className="searchbar" onSubmit={submit} role="search">
      <div className="tabs" role="tablist">
        {(['buy', 'rent'] as Deal[]).map((d) => (
          <button
            type="button"
            key={d}
            role="tab"
            aria-selected={deal === d}
            className={deal === d ? 'tab active' : 'tab'}
            onClick={() => setDeal(d)}
          >
            {d === 'buy' ? 'Buy' : 'Rent'}
          </button>
        ))}
      </div>
      <div className="searchbar-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by city, country or address"
          aria-label="Location"
        />
        <button className="btn btn-primary btn-lg" type="submit">Search</button>
      </div>
    </form>
  );
}
