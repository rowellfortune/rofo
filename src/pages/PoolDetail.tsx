import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getListing } from '../data/listings';
import { formatPrice, placeholderImage } from '../lib/format';
import { goalAmount, monthsLeft, monthlyTotal, poolStatus, quorum, raised, sharePct } from '../lib/pools';
import { ME, usePools } from '../state/PoolsContext';

/** One pool: progress, members and shares, ledger, votes. */
export function PoolDetail() {
  const { id } = useParams();
  const { pools, joinPool, leavePool, contribute, vote } = usePools();
  const pool = pools.find((p) => p.id === id);
  const listing = pool ? getListing(pool.listingId) : undefined;
  const [monthly, setMonthly] = useState(200);

  if (!pool || !listing) {
    return <div className="container section"><h1>Pool not found</h1><Link to="/pools">All pools</Link></div>;
  }

  const goal = goalAmount(listing.price);
  const got = raised(pool);
  const pct = Math.min(100, Math.round((got / goal) * 100));
  const me = pool.members.find((m) => m.id === ME.id);
  const seats = pool.maxMembers - pool.members.length;
  const left = monthsLeft(pool, listing.price);
  const nameOf = (mid: string) => pool.members.find((m) => m.id === mid)?.name ?? 'Member';

  return (
    <div className="container detail">
      <Link to="/pools" className="back">← All pools</Link>
      <div className="pool-head">
        <div className="pool-thumb" style={{ backgroundImage: `url("${placeholderImage(listing.hue, 0, listing.type)}")` }} />
        <div>
          <h1>{pool.name}</h1>
          <p className="muted">
            Buying <Link to={`/property/${listing.id}`}><u>{listing.address}, {listing.city}</u></Link> · {formatPrice(listing.price, 'buy')}
          </p>
          <span className="chip-status">{poolStatus(pool, listing.price)}</span>
        </div>
      </div>

      <div className="pool-grid">
        <div>
          <h2>Progress</h2>
          <div className="progress big"><span style={{ width: `${pct}%` }} /></div>
          <div className="pool-meta">
            <span><strong>{formatPrice(got, 'buy')}</strong> of {formatPrice(goal, 'buy')} ({pct}%)</span>
            <span>{left === 0 ? 'Goal reached' : Number.isFinite(left) ? `About ${left} months left` : 'No monthly pace yet'}</span>
          </div>
          <p className="muted small">Pace: {formatPrice(monthlyTotal(pool), 'buy')} per month across {pool.members.length} members.</p>

          <h2>Members and shares</h2>
          <table className="table">
            <thead><tr><th>Member</th><th>Monthly</th><th>Paid in</th><th>Share</th></tr></thead>
            <tbody>
              {pool.members.map((m) => (
                <tr key={m.id} className={m.id === ME.id ? 'me' : ''}>
                  <td>{m.name}</td>
                  <td>{formatPrice(m.monthly, 'buy')}</td>
                  <td>{formatPrice(m.contributed, 'buy')}</td>
                  <td><strong>{sharePct(pool, m).toFixed(1)}%</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Shares follow what each member has paid in. One member, one vote, whatever the share.</p>

          <h2>Votes</h2>
          {pool.proposals.length === 0 && <p className="muted">No open votes.</p>}
          {pool.proposals.map((pr) => {
            const yes = Object.values(pr.votes).filter((v) => v === 'yes').length;
            const no = Object.values(pr.votes).filter((v) => v === 'no').length;
            const need = quorum(pool.members.length);
            const mine = pr.votes[ME.id];
            return (
              <div className="proposal" key={pr.id}>
                <strong>{pr.title}</strong>
                <p className="muted">{pr.detail}</p>
                <div className="pool-meta">
                  <span>Yes {yes} · No {no} · Needs {need} yes</span>
                  <span>{yes >= need ? 'Passed' : no > pool.members.length - need ? 'Rejected' : 'Open'}</span>
                </div>
                {me && (
                  <div className="vote-btns">
                    <button className={`btn btn-ghost${mine === 'yes' ? ' on' : ''}`} onClick={() => vote(pool.id, pr.id, 'yes')}>Yes</button>
                    <button className={`btn btn-ghost${mine === 'no' ? ' on' : ''}`} onClick={() => vote(pool.id, pr.id, 'no')}>No</button>
                  </div>
                )}
              </div>
            );
          })}

          <h2>Ledger</h2>
          {pool.ledger.length === 0 && <p className="muted">No payments yet.</p>}
          <ul className="ledger">
            {pool.ledger.map((e) => (
              <li key={e.id}><span>{e.date}</span><span>{nameOf(e.memberId)}</span><span className="muted">{e.note}</span><strong>{formatPrice(e.amount, 'buy')}</strong></li>
            ))}
          </ul>
        </div>

        <aside className="contact">
          {me ? (
            <>
              <h3>You are in this pool</h3>
              <p className="muted">Your share: <strong>{sharePct(pool, me).toFixed(1)}%</strong> · {formatPrice(me.monthly, 'buy')} per month</p>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => contribute(pool.id)}>
                Pay this month (demo)
              </button>
              {me.contributed === 0 && (
                <button className="btn btn-ghost btn-block" onClick={() => leavePool(pool.id)}>Leave pool</button>
              )}
              <p className="muted small">No real payment happens. Leaving after paying in needs the exit rules of a signed agreement.</p>
            </>
          ) : seats > 0 ? (
            <>
              <h3>Join this pool</h3>
              <p className="muted">{seats} seat{seats === 1 ? '' : 's'} open.</p>
              <label className="slider">Monthly amount: <strong>{formatPrice(monthly, 'buy')}</strong>
                <input type="range" min={50} max={1000} step={25} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} />
              </label>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => joinPool(pool.id, monthly)}>Join pool</button>
            </>
          ) : (
            <p className="muted">This pool is full.</p>
          )}
          <p className="notice small">Demo only. Real pools need a signed co-ownership agreement, title held in an entity or trust, and escrow.</p>
        </aside>
      </div>
    </div>
  );
}
