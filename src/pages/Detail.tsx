import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiEnabled } from '../api/config';
import { apiFavoriteIds, apiSendInquiry, apiToggleFavorite } from '../api/listings';
import { useListing } from '../hooks/useListings';
import { formatPrice, placeholderImage } from '../lib/format';
import { PoolBuyPanel } from '../components/PoolBuyPanel';
import { ResultsMap } from '../components/ResultsMap';
import { hasCoords } from '../api/mappers';
import { useAuth } from '../state/AuthContext';

/** Property detail: gallery, key facts, map, contact form. */
export function Detail() {
  const { id } = useParams();
  const { data: l, loading, error } = useListing(id);
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // API mode: know whether the signed-in user already saved this listing.
  useEffect(() => {
    if (!apiEnabled || !user || !id) return;
    apiFavoriteIds().then((ids) => setSaved(ids.includes(id))).catch(() => {});
  }, [user, id]);

  if (loading) return <div className="container section"><p className="muted">Loading property...</p></div>;
  if (error) return <div className="container section"><div className="notice" role="alert">Could not load this property. {error}</div></div>;
  if (!l) {
    return (
      <div className="container section">
        <h1>Property not found</h1>
        <Link to="/search">Back to search</Link>
      </div>
    );
  }

  /** Save or unsave. Needs an account in API mode. */
  const toggleSave = async () => {
    if (!apiEnabled) return setSaved(!saved);
    if (!user) return;
    try { setSaved(await apiToggleFavorite(l.id)); } catch (e) { setFormError((e as Error).message); }
  };

  /** Send the inquiry. Demo mode fakes success. API mode saves it for the agent. */
  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!apiEnabled) return setSent(true);
    const f = new FormData(e.currentTarget);
    setBusy(true); setFormError(null);
    try {
      await apiSendInquiry({
        listingId: l.id, name: String(f.get('name')), email: String(f.get('email')), message: String(f.get('message')),
      });
      setSent(true);
    } catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  };

  const facts: [string, string][] = [
    ['Type', l.type],
    ['Listing', l.deal === 'buy' ? 'For sale' : 'For rent'],
    ...(l.areaM2 ? [['Living area', `${l.areaM2} m²`] as [string, string]] : []),
    ...(l.plotM2 ? [['Plot', `${l.plotM2} m²`] as [string, string]] : []),
    ...(l.beds ? [['Bedrooms', String(l.beds)] as [string, string]] : []),
    ...(l.baths ? [['Bathrooms', String(l.baths)] as [string, string]] : []),
    ...(l.yearBuilt ? [['Year built', String(l.yearBuilt)] as [string, string]] : []),
  ];
  // Photos first. Pad with illustrations so the grid always has four tiles.
  const tiles = [0, 1, 2, 3].map((i) => l.images?.[i] ?? placeholderImage(l.hue, i, l.type));
  const needsLogin = apiEnabled && !user;

  return (
    <div className="container detail">
      <Link to="/search" className="back">← Back to results</Link>

      <div className="gallery">
        {tiles.map((src, i) => <div key={i} className={`g g${i}`} style={{ backgroundImage: `url("${src}")` }} />)}
      </div>

      <div className="detail-grid">
        <div>
          <div className="detail-head">
            <div>
              <h1>{l.address}</h1>
              <p className="muted">{l.city}, {l.country}</p>
            </div>
            <button className="btn btn-ghost" onClick={() => void toggleSave()} aria-pressed={saved} disabled={needsLogin}
              title={needsLogin ? 'Sign in to save' : undefined}>
              {saved ? '♥ Saved' : '♡ Save'}
            </button>
          </div>
          <div className="detail-price">{formatPrice(l.price, l.deal)}</div>

          <h2>{l.title}</h2>
          <p>{l.description}</p>

          <h3>Features</h3>
          <ul className="chips">{l.features.map((f) => <li key={f}>{f}</li>)}</ul>

          {hasCoords(l) && (
            <>
              <h3>Location</h3>
              <div className="detail-map"><ResultsMap items={[l]} single /></div>
              <p className="muted small">Approximate location.</p>
            </>
          )}

          <h3>Details</h3>
          <dl className="facts">
            {facts.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
        </div>

        <aside className="contact">
          <div className="agent">
            <div className="avatar">{l.agent.name[0]}</div>
            <div><strong>{l.agent.name}</strong><div className="muted small">{l.agent.agency}</div></div>
          </div>
          {sent ? (
            <p className="success">Thanks. {l.agent.name} will reply soon.</p>
          ) : needsLogin ? (
            <Link className="btn btn-primary btn-lg btn-block" to={`/login?next=${encodeURIComponent(`/property/${l.id}`)}`}>
              Sign in to contact the agent
            </Link>
          ) : (
            <form onSubmit={(e) => void send(e)}>
              <input name="name" required minLength={2} defaultValue={user?.name} placeholder="Your name" aria-label="Your name" />
              <input name="email" required type="email" defaultValue={user?.email} placeholder="Email" aria-label="Email" />
              <textarea name="message" required minLength={5} rows={4} defaultValue={`I am interested in ${l.address}.`} aria-label="Message" />
              {formError && <div className="notice small" role="alert">{formError}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send message'}</button>
            </form>
          )}
          <a className="btn btn-ghost btn-block" href={`tel:${l.agent.phone}`}>Call {l.agent.phone}</a>
          <PoolBuyPanel listing={l} />
        </aside>
      </div>
    </div>
  );
}
