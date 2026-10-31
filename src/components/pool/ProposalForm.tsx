import { useState, type FormEvent } from 'react';
import { buildProposal } from '../../lib/poolForms';

/** Members propose a decision for the group to vote on, for example an offer or a cost. */
export function ProposalForm({ onSubmit }: { onSubmit: (p: { title: string; detail: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!open) return <button className="btn btn-ghost" onClick={() => setOpen(true)}>New proposal</button>;

  /** Validate, send, then close the form. */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = buildProposal(title, detail);
    if (!r.ok) { setErrors(r.errors); return; }
    setBusy(true); setFailure(null);
    try {
      await onSubmit(r.input);
      setTitle(''); setDetail(''); setErrors({}); setOpen(false);
    } catch (err) { setFailure((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <form className="proposal-form" onSubmit={(e) => void submit(e)} noValidate>
      <label className={`field${errors.title ? ' has-error' : ''}`}>
        <span>What should the group decide?</span>
        <input value={title} maxLength={120} placeholder="Offer 270,000 USD on Gravenstraat 48"
          onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: '' })); }} />
        {errors.title && <small className="field-error" role="alert">{errors.title}</small>}
      </label>
      <label className={`field${errors.detail ? ' has-error' : ''}`}>
        <span>Details (optional)</span>
        <textarea rows={3} value={detail} maxLength={1000} placeholder="Costs, deadline, who is affected"
          onChange={(e) => { setDetail(e.target.value); setErrors((x) => ({ ...x, detail: '' })); }} />
        {errors.detail && <small className="field-error" role="alert">{errors.detail}</small>}
      </label>
      {failure && <div className="notice small" role="alert">{failure}</div>}
      <div className="row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setErrors({}); setFailure(null); }}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Posting...' : 'Post proposal'}</button>
      </div>
    </form>
  );
}
