import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiListingInquiries } from '../../api/agent';
import { apiGetListing } from '../../api/listings';
import type { Inquiry, Listing } from '../../types';

/** Messages buyers sent about one listing. */
export function Inquiries() {
  const { id = '' } = useParams();
  const [listing, setListing] = useState<Listing | undefined>();
  const [rows, setRows] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGetListing(id).then(setListing).catch(() => {});
    apiListingInquiries(id).then(setRows).catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <div className="container detail">
      <Link to="/agent" className="back">← Your listings</Link>
      <h1>Inquiries</h1>
      {listing && <p className="muted">{listing.address}, {listing.city}</p>}
      {error && <div className="notice" role="alert">{error}</div>}
      {rows && rows.length === 0 && <p className="muted">No inquiries yet.</p>}
      {rows?.map((q) => (
        <div className="proposal" key={q.id}>
          <div className="pool-meta">
            <strong>{q.name}</strong>
            <span className="muted small">{new Date(q.createdAt).toLocaleString()}</span>
          </div>
          <p>{q.message}</p>
          <a className="btn btn-ghost" href={`mailto:${q.email}?subject=${encodeURIComponent(`Your inquiry about ${listing?.address ?? 'a listing'}`)}`}>
            Reply to {q.email}
          </a>
        </div>
      ))}
    </div>
  );
}
