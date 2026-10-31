import { Link } from 'react-router-dom';
import { PoolCard } from '../components/PoolCard';
import { usePools } from '../state/PoolsContext';

/** Pools overview: how it works and every open pool. */
export function Pools() {
  const { pools, loading, error, clearError, needsAuth } = usePools();
  const steps = [
    ['Pick a home', 'Choose a property you can afford together.'],
    ['Form a group', 'Invite 3 to 12 people. Agree each person\'s monthly amount.'],
    ['Save together', 'Contributions build the deposit. Your ownership share follows what you paid in.'],
    ['Vote and buy', 'One member, one vote. The group decides on offers and costs.'],
  ];

  return (
    <>
      <section className="hero hero-slim">
        <div className="container hero-inner">
          <h1>Buy a home together</h1>
          <p className="hero-sub">Save with a small group. Own a share of a home.</p>
          <Link to="/pools/new" className="btn btn-primary btn-lg">Start a pool</Link>
        </div>
      </section>

      <section className="container section">
        <h2>How it works</h2>
        <ol className="steps">
          {steps.map(([t, d], i) => (
            <li key={t}><span className="step-n">{i + 1}</span><strong>{t}</strong><p className="muted">{d}</p></li>
          ))}
        </ol>
        <p className="notice">
          Demo with sample data. No money moves here. A real pool needs a written co-ownership
          agreement, a legal entity or trust to hold title, and escrow for contributions. Get local legal advice first.
        </p>
      </section>

      <section className="container section">
        <h2>Open pools</h2>
        {error && <div className="notice" role="alert">{error} <button className="btn btn-ghost" onClick={clearError}>Dismiss</button></div>}
        {needsAuth ? (
          <p className="muted">Sign in to browse and join pools. <Link to="/login?next=/pools"><u>Sign in</u></Link></p>
        ) : loading && pools.length === 0 ? (
          <p className="muted">Loading pools...</p>
        ) : pools.length === 0 ? (
          <p className="muted">No open pools yet. Start the first one.</p>
        ) : (
          <div className="grid">{pools.map((p) => <PoolCard key={p.id} pool={p} />)}</div>
        )}
      </section>
    </>
  );
}
