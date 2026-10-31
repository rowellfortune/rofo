import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDeleteListing, apiMyListings } from '../../api/agent';
import { formatPrice } from '../../lib/format';
import { isRevokedError } from '../../lib/applicationForm';
import { useAuth } from '../../state/AuthContext';
import type { Listing } from '../../types';

/** The agent's listings with quick actions. */
export function AgentDashboard() {
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { refresh } = useAuth();

  /** Show an error. If it says access was revoked, refresh the session so the page drops to "access needed". */
  const fail = useCallback((e: Error) => {
    setError(isRevokedError(e.message) ? 'Your agent access was removed. Updating your account...' : e.message);
    if (isRevokedError(e.message)) void refresh().catch(() => {});
  }, [refresh]);

  const load = useCallback(() => {
    apiMyListings().then(setItems).catch(fail);
  }, [fail]);
  useEffect(load, [load]);

  /** Delete after a confirmation. Favorites pointing at it are skipped on read by the API. */
  const remove = async (l: Listing) => {
    if (!window.confirm(`Delete "${l.address}"? This cannot be undone.`)) return;
    setBusyId(l.id); setError(null);
    try {
      await apiDeleteListing(l.id);
      setItems((all) => (all ?? []).filter((x) => x.id !== l.id));
    } catch (e) { fail(e as Error); } finally { setBusyId(null); }
  };

  const noCoords = (items ?? []).filter((l) => !Number.isFinite(l.lat)).length;

  return (
    <div className="container detail">
      <div className="dash-head">
        <div>
          <h1>Your listings</h1>
          <p className="muted">{items ? `${items.length} ${items.length === 1 ? 'listing' : 'listings'}` : 'Loading...'}</p>
        </div>
        <Link to="/agent/new" className="btn btn-primary">New listing</Link>
      </div>

      {error && <div className="notice" role="alert">{error}</div>}
      {noCoords > 0 && (
        <div className="notice">{noCoords} {noCoords === 1 ? 'listing has' : 'listings have'} no map location, so {noCoords === 1 ? 'it does' : 'they do'} not appear on the map. Open Edit and drop a pin.</div>
      )}

      {items && items.length === 0 && (
        <div className="form-card">
          <h3>No listings yet</h3>
          <p className="muted">Add your first property with photos, price and a map pin.</p>
          <Link to="/agent/new" className="btn btn-primary">Create a listing</Link>
        </div>
      )}

      {items && items.length > 0 && (
        <table className="table dash-table">
          <thead><tr><th>Property</th><th>Type</th><th>Price</th><th>Photos</th><th>Map</th><th /></tr></thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.suspended ? <strong>{l.address}</strong> : <Link to={`/property/${l.id}`}><strong>{l.address}</strong></Link>}
                  {l.suspended && <span className="chip-status bad" title="Hidden from the public">Hidden</span>}
                  <div className="muted small">{l.city}, {l.country} · {l.deal === 'buy' ? 'For sale' : 'For rent'}</div>
                </td>
                <td>{l.type}</td>
                <td>{formatPrice(l.price, l.deal)}</td>
                <td>{l.imageKeys?.length ?? 0}</td>
                <td>{Number.isFinite(l.lat) ? 'Pinned' : <span className="muted">Not set</span>}</td>
                <td className="row-actions">
                  <Link className="btn btn-ghost" to={`/agent/${l.id}/inquiries`}>Inquiries</Link>
                  <Link className="btn btn-ghost" to={`/agent/${l.id}/edit`}>Edit</Link>
                  <button className="btn btn-ghost" disabled={busyId === l.id} onClick={() => void remove(l)}>
                    {busyId === l.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
