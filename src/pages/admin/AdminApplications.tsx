import { useCallback, useEffect, useState } from 'react';
import { apiListApplications, apiReviewApplication, apiRevokeAgent } from '../../api/applications';
import { validReason } from '../../lib/poolForms';
import type { AgentApplication } from '../../types';

type Status = AgentApplication['status'];
const TABS: { status: Status; label: string }[] = [
  { status: 'PENDING', label: 'Pending' }, { status: 'APPROVED', label: 'Approved' }, { status: 'REJECTED', label: 'Rejected' }, { status: 'REVOKED', label: 'Revoked' },
];

/** Admin queue for agent applications. */
export function AdminApplications() {
  const [tab, setTab] = useState<Status>('PENDING');
  const [rows, setRows] = useState<AgentApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null); // user id with the reason box open
  const [note, setNote] = useState('');
  // Revoking an approved agent.
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [hideListings, setHideListings] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null); setError(null); setNotice(null); setRevoking(null);
    apiListApplications(tab).then(setRows).catch((e: Error) => { setRows([]); setError(e.message); });
  }, [tab]);
  useEffect(load, [load]);

  /** Approve or reject, then drop the row from this list. */
  const decide = async (a: AgentApplication, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(a.userId); setError(null);
    try {
      await apiReviewApplication(a.userId, decision, decision === 'REJECTED' ? note : undefined);
      setRows((r) => (r ?? []).filter((x) => x.userId !== a.userId));
      setRejecting(null); setNote('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  /** Take agent access away. The server blocks the person at once and reports what happened to their listings. */
  const revoke = async (a: AgentApplication) => {
    setBusy(a.userId); setError(null); setNotice(null);
    try {
      const done = await apiRevokeAgent(a.userId, revokeReason.trim(), hideListings);
      setRows((r) => (r ?? []).filter((x) => x.userId !== a.userId));
      setRevoking(null); setRevokeReason('');
      const hidden = done.listingsHidden ?? 0, failed = done.listingsFailed ?? 0;
      setNotice(
        `Access revoked for ${a.name}.` +
        (hideListings ? ` ${hidden} ${hidden === 1 ? 'listing' : 'listings'} hidden.` : ' Their listings stay visible.') +
        (failed !== 0 ? ` ${failed < 0 ? 'Hiding listings failed' : `${failed} could not be hidden`}. Check the logs and hide them by hand.` : ''),
      );
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="container detail">
      <h1>Agent applications</h1>
      <div className="tabs admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.status} role="tab" aria-selected={tab === t.status} className={tab === t.status ? 'tab active' : 'tab'} onClick={() => setTab(t.status)}>{t.label}</button>
        ))}
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="success" role="status">{notice}</div>}
      {rows === null && <p className="muted">Loading...</p>}
      {rows && rows.length === 0 && !error && <p className="muted">Nothing here.</p>}
      {rows?.map((a) => (
        <article className="proposal app-card" key={a.userId}>
          <div className="pool-meta">
            <strong>{a.name} · {a.agency}</strong>
            <span className="muted small">{new Date(a.createdAt).toLocaleDateString()}</span>
          </div>
          <dl className="facts">
            <div><dt>Email</dt><dd><a href={`mailto:${a.email}`}>{a.email}</a></dd></div>
            <div><dt>Phone</dt><dd>{a.phone}</dd></div>
            <div><dt>Registration</dt><dd>{a.registrationNo}</dd></div>
            <div><dt>Country</dt><dd>{a.country}</dd></div>
            {a.website && <div><dt>Website</dt><dd><a href={a.website} target="_blank" rel="noopener noreferrer">{a.website}</a></dd></div>}
          </dl>
          <p>{a.about}</p>
          {a.priorRevocationNote && (
            <div className="notice small" role="note">
              <strong>Lost agent access before</strong> ({a.priorRevocationAt ? new Date(a.priorRevocationAt).toLocaleDateString() : 'earlier'}): {a.priorRevocationNote}
            </div>
          )}
          {a.reviewNote && <p className="muted small">{a.status === 'REVOKED' ? 'Reason for revoking' : 'Note'}: {a.reviewNote}</p>}
          {a.status === 'APPROVED' && (
            revoking === a.userId ? (
              <div className="reject-box">
                <textarea rows={2} placeholder="Why is access being removed? The person and later admins will see this." value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)} aria-label="Reason for revoking access" />
                <label className="check"><input type="checkbox" checked={hideListings} onChange={(e) => setHideListings(e.target.checked)} /> Hide their listings from the public</label>
                <p className="muted small">They are blocked immediately, even if they are signed in. They can apply again later.</p>
                <div className="row-actions">
                  <button className="btn btn-ghost" onClick={() => { setRevoking(null); setRevokeReason(''); }}>Cancel</button>
                  <button className="btn btn-primary" disabled={busy === a.userId || !validReason(revokeReason)} onClick={() => void revoke(a)}>
                    {busy === a.userId ? 'Revoking...' : 'Revoke access'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => { setRevoking(a.userId); setRevokeReason(''); setHideListings(true); }}>Revoke access</button>
              </div>
            )
          )}
          {a.status === 'PENDING' && (
            rejecting === a.userId ? (
              <div className="reject-box">
                <textarea rows={2} placeholder="Reason the applicant will see" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Rejection reason" />
                <div className="row-actions">
                  <button className="btn btn-ghost" onClick={() => { setRejecting(null); setNote(''); }}>Cancel</button>
                  <button className="btn btn-primary" disabled={busy === a.userId || note.trim().length < 5} onClick={() => void decide(a, 'REJECTED')}>Send rejection</button>
                </div>
              </div>
            ) : (
              <div className="row-actions">
                <button className="btn btn-ghost" disabled={busy === a.userId} onClick={() => { setRejecting(a.userId); setNote(''); }}>Reject</button>
                <button className="btn btn-primary" disabled={busy === a.userId} onClick={() => void decide(a, 'APPROVED')}>{busy === a.userId ? 'Approving...' : 'Approve'}</button>
              </div>
            )
          )}
        </article>
      ))}
    </div>
  );
}
