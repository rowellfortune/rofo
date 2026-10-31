import { useState, type FormEvent } from 'react';
import { formatPrice } from '../../lib/format';
import { buildPayment } from '../../lib/poolForms';
import type { PoolMember } from '../../types';

interface Props {
  members: PoolMember[];
  onRecord: (p: { userId: string; amount: number; reference: string; note?: string }) => Promise<void>;
}

/**
 * Admin only. Records a payment that escrow or the bank has already confirmed.
 * Members never see this: they must not be able to credit themselves.
 */
export function PaymentPanel({ members, onRecord }: Props) {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /** Validate, ask for a final confirmation, then record. */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(null); setFailure(null);
    const r = buildPayment({ userId, amount, reference, note });
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors({});
    const who = members.find((m) => m.id === r.input.userId)?.name ?? 'member';
    if (!window.confirm(`Record ${formatPrice(r.input.amount, 'buy')} for ${who}?\nReference: ${r.input.reference}\nThis changes their ownership share.`)) return;
    setBusy(true);
    try {
      await onRecord({ userId: r.input.userId, amount: r.input.amount, reference: r.input.reference, note: r.input.note || undefined });
      setDone(`Recorded ${formatPrice(r.input.amount, 'buy')} for ${who}.`);
      setAmount(''); setReference(''); setNote('');
    } catch (err) { setFailure((err as Error).message); } finally { setBusy(false); }
  };

  const bad = (k: string) => (errors[k] ? ' has-error' : '');
  return (
    <form className="payment-panel" onSubmit={(e) => void submit(e)} noValidate>
      <h3>Record a confirmed payment</h3>
      <p className="muted small">Only enter money that escrow or the bank has already confirmed. The reference stops the same payment being entered twice.</p>
      <label className={`field${bad('userId')}`}>
        <span>Member</span>
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Choose...</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {errors.userId && <small className="field-error" role="alert">{errors.userId}</small>}
      </label>
      <label className={`field${bad('amount')}`}>
        <span>Amount (USD)</span>
        <input inputMode="decimal" value={amount} placeholder="200.00" onChange={(e) => setAmount(e.target.value)} />
        {errors.amount && <small className="field-error" role="alert">{errors.amount}</small>}
      </label>
      <label className={`field${bad('reference')}`}>
        <span>Escrow or bank reference</span>
        <input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
        {errors.reference && <small className="field-error" role="alert">{errors.reference}</small>}
      </label>
      <label className={`field${bad('note')}`}>
        <span>Note (optional)</span>
        <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
        {errors.note && <small className="field-error" role="alert">{errors.note}</small>}
      </label>
      {failure && <div className="notice small" role="alert">{failure}</div>}
      {done && <div className="success" role="status">{done}</div>}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Recording...' : 'Record payment'}</button>
    </form>
  );
}
