import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ledger } from '../components/pool/Ledger';
import { MyContributions } from '../components/pool/MyContributions';
import { PaymentPanel } from '../components/pool/PaymentPanel';
import { ProposalCard } from '../components/pool/ProposalCard';
import { ProposalForm } from '../components/pool/ProposalForm';
import { useListing } from '../hooks/useListings';
import { formatPrice, placeholderImage } from '../lib/format';
import { goalAmount, memberCount, monthsLeft, monthlyTotal, poolStatus, raised, sharePct } from '../lib/pools';
import { usePools } from '../state/PoolsContext';

/** One pool: progress, members and shares, votes, payments. */
export function PoolDetail() {
  const { id } = useParams();
  const {
    pools, meId, canSelfPay, isAdmin, needsAuth, loading, error, clearError, loadPool,
    joinPool, leavePool, contribute, vote, createProposal, recordContribution, reverseContribution,
  } = usePools();
  const pool = pools.find((p) => p.id === id);
  const { data: listing } = useListing(pool?.listingId);
  const [monthly, setMonthly] = useState(200);

  // API mode: fetch full detail (members, ledger, votes) for this pool.
  useEffect(() => { if (id) void loadPool(id); }, [id, loadPool]);

  if (needsAuth) {
    return (
      <div className="container section">
        <h1>Sign in to view this pool</h1>
        <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/pools/${id}`)}`}>Sign in</Link>
      </div>
    );
  }
  if (!pool || !listing) {
    return (
      <div className="container section">
        {error && <div className="notice" role="alert">{error}</div>}
        {loading || (pool && !listing) ? <p className="muted">Loading pool...</p> : <><h1>Pool not found</h1><Link to="/pools">All pools</Link></>}
      </div>
    );
  }

  const goal = goalAmount(listing.price);
  const got = raised(pool);
  const pct = Math.min(100, Math.round((got / goal) * 100));
  const me = pool.members.find((m) => m.id === meId);
  const seats = pool.maxMembers - memberCount(pool);
  const left = monthsLeft(pool, listing.price);
  const nameOf = (mid: string) => pool.members.find((m) => m.id === mid)?.name ?? 'Member';
  // Non-members only get totals from the API. Names, shares, ledger and votes stay private.
  const membersHidden = pool.members.length === 0 && memberCount(pool) > 0;

  /** Run an action. Errors land in the banner via the context. */
  const run = (fn: () => Promise<void>) => { fn().catch(() => {}); };

  return (
    <div className="container detail">
      <Link to="/pools" className="back">← All pools</Link>
      {error && (
        <div className="notice" role="alert">{error} <button className="btn btn-ghost" onClick={clearError}>Dismiss</button></div>
      )}
      <div className="pool-head">
        <div className="pool-thumb" style={{ backgroundImage: `url("${listing.images?.[0] ?? placeholderImage(listing.hue, 0, listing.type)}")` }} />
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
            <span>{left === 0 ? 'Goal reached' : Number.isFinite(left) ? `About ${left} months left` : membersHidden ? '' : 'No monthly pace yet'}</span>
          </div>
          {!membersHidden && (
            <p className="muted small">Pace: {formatPrice(monthlyTotal(pool), 'buy')} per month across {pool.members.length} members.</p>
          )}

          {membersHidden ? (
            <>
              <h2>Members</h2>
              <p className="muted">{memberCount(pool)} of {pool.maxMembers} seats taken. Names, shares, payments and votes are visible to members only.</p>
            </>
          ) : (
            <>
              <h2>Members and shares</h2>
              <table className="table">
                <thead><tr><th>Member</th><th>Monthly</th><th>Paid in</th><th>Share</th></tr></thead>
                <tbody>
                  {pool.members.map((m) => (
                    <tr key={m.id} className={m.id === meId ? 'me' : ''}>
                      <td>{m.id === meId ? `${m.name} (you)` : m.name}</td>
                      <td>{formatPrice(m.monthly, 'buy')}</td>
                      <td>{formatPrice(m.contributed, 'buy')}</td>
                      <td><strong>{sharePct(pool, m).toFixed(1)}%</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Shares follow what each member has paid in. One member, one vote, whatever the share.</p>

              <div className="section-head votes-head">
                <h2>Votes</h2>
                {me && <ProposalForm onSubmit={(p) => createProposal(pool.id, p)} />}
              </div>
              {pool.proposals.length === 0 && <p className="muted">No proposals yet.{me ? ' Start one to put a decision to the group.' : ''}</p>}
              {pool.proposals.map((pr) => (
                <ProposalCard key={pr.id} pool={pool} proposal={pr} meId={meId} canVote={Boolean(me)} total={pool.members.length}
                  onVote={(choice) => vote(pool.id, pr.id, choice)} />
              ))}

              <h2>Payments</h2>
              <Ledger entries={pool.ledger} nameOf={nameOf} canReverse={isAdmin}
                onReverse={(entryId, reason) => reverseContribution(pool.id, entryId, reason)} />
            </>
          )}
        </div>

        <aside className="contact">
          {me ? (
            <>
              <h3>You are in this pool</h3>
              <MyContributions me={me} share={sharePct(pool, me)} ledger={pool.ledger} />
              {canSelfPay ? (
                <button className="btn btn-primary btn-lg btn-block" onClick={() => run(() => contribute(pool.id))}>Pay this month (demo)</button>
              ) : (
                <p className="muted small">Payments are confirmed through escrow and appear under Payments once received.</p>
              )}
              {me.contributed === 0 && (
                <button className="btn btn-ghost btn-block" onClick={() => run(() => leavePool(pool.id))}>Leave pool</button>
              )}
              <p className="muted small">Leaving after paying in needs the exit rules of a signed agreement.</p>
            </>
          ) : seats > 0 ? (
            <>
              <h3>Join this pool</h3>
              <p className="muted">{seats} seat{seats === 1 ? '' : 's'} open.</p>
              <label className="slider">Monthly amount: <strong>{formatPrice(monthly, 'buy')}</strong>
                <input type="range" min={50} max={1000} step={25} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} />
              </label>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => run(() => joinPool(pool.id, monthly))}>Join pool</button>
            </>
          ) : (
            <p className="muted">This pool is full.</p>
          )}

          {isAdmin && !membersHidden && (
            <PaymentPanel members={pool.members}
              onRecord={async (p) => { try { await recordContribution(pool.id, p); } catch (e) { clearError(); throw e; } }} />
          )}
          <p className="notice small">{canSelfPay ? 'Demo only. ' : ''}Real pools need a signed co-ownership agreement, title held in an entity or trust, and escrow.</p>
        </aside>
      </div>
    </div>
  );
}
