import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getListing } from '../data/listings';
import { formatPrice, placeholderImage } from '../lib/format';
import { PoolBuyPanel } from '../components/PoolBuyPanel';

/** Property detail: gallery, key facts, description, contact form. */
export function Detail() {
  const { id } = useParams();
  const l = id ? getListing(id) : undefined;
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!l) {
    return (
      <div className="container section">
        <h1>Property not found</h1>
        <Link to="/search">Back to search</Link>
      </div>
    );
  }

  /** Mock submit. Wire to an API later. */
  const send = (e: FormEvent) => { e.preventDefault(); setSent(true); };

  const facts: [string, string][] = [
    ['Type', l.type],
    ['Listing', l.deal === 'buy' ? 'For sale' : 'For rent'],
    ...(l.areaM2 ? [['Living area', `${l.areaM2} m²`] as [string, string]] : []),
    ...(l.plotM2 ? [['Plot', `${l.plotM2} m²`] as [string, string]] : []),
    ...(l.beds ? [['Bedrooms', String(l.beds)] as [string, string]] : []),
    ...(l.baths ? [['Bathrooms', String(l.baths)] as [string, string]] : []),
    ...(l.yearBuilt ? [['Year built', String(l.yearBuilt)] as [string, string]] : []),
  ];

  return (
    <div className="container detail">
      <Link to="/search" className="back">← Back to results</Link>

      <div className="gallery">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`g g${i}`} style={{ backgroundImage: `url("${placeholderImage(l.hue, i, l.type)}")` }} />
        ))}
      </div>

      <div className="detail-grid">
        <div>
          <div className="detail-head">
            <div>
              <h1>{l.address}</h1>
              <p className="muted">{l.city}, {l.country}</p>
            </div>
            <button className="btn btn-ghost" onClick={() => setSaved(!saved)} aria-pressed={saved}>
              {saved ? '♥ Saved' : '♡ Save'}
            </button>
          </div>
          <div className="detail-price">{formatPrice(l.price, l.deal)}</div>

          <h2>{l.title}</h2>
          <p>{l.description}</p>

          <h3>Features</h3>
          <ul className="chips">{l.features.map((f) => <li key={f}>{f}</li>)}</ul>

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
          ) : (
            <form onSubmit={send}>
              <input required placeholder="Your name" aria-label="Your name" />
              <input required type="email" placeholder="Email" aria-label="Email" />
              <textarea rows={4} defaultValue={`I am interested in ${l.address}.`} aria-label="Message" />
              <button className="btn btn-primary btn-lg" type="submit">Send message</button>
            </form>
          )}
          <a className="btn btn-ghost btn-block" href={`tel:${l.agent.phone}`}>Call {l.agent.phone}</a>
          <PoolBuyPanel listing={l} />
        </aside>
      </div>
    </div>
  );
}
