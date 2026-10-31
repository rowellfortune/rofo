import { useState } from 'react';
import { formatPrice } from '../../lib/format';
import { validReason } from '../../lib/poolForms';
import type { LedgerEntry } from '../../types';

interface Props {
  entries: LedgerEntry[];
  nameOf: (memberId: string) => string;
  /** Admins can reverse a payment. */
  canReverse: boolean;
  onReverse: (entryId: string, reason: string) => Promise<void>;
}

/** Payment history. Reversed payments stay visible but struck through, so the trail is complete. */
export function Ledger({ entries, nameOf, canReverse, onReverse }: Props) {
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (entries.length === 0) return <p className="muted">No payments yet.</p>;

  /** Confirm and send a reversal. */
  const confirm = async (id: string) => {
    setBusy(true);
    try { await onReverse(id, reason.trim()); setReversing(null); setReason(''); } catch { /* shown by the page */ } finally { setBusy(false); }
  };

  return (
    <ul className="ledger">
      {entries.map((e) => {
        const isReversal = Boolean(e.reversalOf);
        const reversed = Boolean(e.reversedAt);
        return (
          <li key={e.id} className={`${reversed ? 'is-reversed' : ''}${isReversal ? ' is-reversal' : ''}`}>
            <span>{e.date}</span>
            <span>{nameOf(e.memberId)}</span>
            <span className="muted">
              {e.note}
              {e.reference && <small className="ref"> · ref {e.reference}</small>}
              {reversed && <span className="chip-status bad">Reversed</span>}
            </span>
            <strong className={e.amount < 0 ? 'neg' : ''}>{e.amount < 0 ? '−' : ''}{formatPrice(Math.abs(e.amount), 'buy')}</strong>
            {canReverse && !reversed && !isReversal && e.amount > 0 && reversing !== e.id && (
              <button className="btn btn-ghost link-btn" onClick={() => { setReversing(e.id); setReason(''); }}>Reverse</button>
            )}
            {reversing === e.id && (
              <div className="reverse-box">
                <input aria-label="Reason for reversal" placeholder="Why is this being reversed?" value={reason} onChange={(ev) => setReason(ev.target.value)} />
                <button className="btn btn-ghost" onClick={() => setReversing(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy || !validReason(reason)} onClick={() => void confirm(e.id)}>
                  {busy ? 'Reversing...' : 'Confirm reversal'}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
