import { useState } from 'react';
import { proposalView } from '../../lib/pools';
import type { Pool, Proposal } from '../../types';

interface Props {
  pool: Pool;
  proposal: Proposal;
  meId: string | null;
  /** Only members vote. */
  canVote: boolean;
  total: number; // members in the pool
  onVote: (choice: 'yes' | 'no') => Promise<void>;
}

const LABEL = { PASSED: 'Passed', REJECTED: 'Rejected', OPEN: 'Open' } as const;

/** One proposal with a live tally, the threshold, and vote buttons. */
export function ProposalCard({ pool, proposal, meId, canVote, total, onVote }: Props) {
  const v = proposalView(pool, proposal, meId);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const denom = Math.max(total, 1);
  const pct = (n: number) => `${Math.min(100, (n / denom) * 100)}%`;

  /** Cast or change a vote. Errors show in the pool banner, so we only reset the busy state here. */
  const vote = async (choice: 'yes' | 'no') => {
    setBusy(choice);
    try { await onVote(choice); } catch { /* shown by the page */ } finally { setBusy(null); }
  };

  return (
    <article className="proposal" aria-label={proposal.title}>
      <div className="pool-meta">
        <strong>{proposal.title}</strong>
        <span className={`chip-status ${v.status === 'PASSED' ? 'ok' : v.status === 'REJECTED' ? 'bad' : ''}`}>{LABEL[v.status]}</span>
      </div>
      {proposal.detail && <p className="muted">{proposal.detail}</p>}

      {/* Bar: green yes, red no, a tick where the threshold is. */}
      <div className="tally" role="img" aria-label={`${v.yes} yes, ${v.no} no, ${v.needed} yes needed`}>
        <span className="tally-yes" style={{ width: pct(v.yes) }} />
        <span className="tally-no" style={{ width: pct(v.no) }} />
        <span className="tally-mark" style={{ left: pct(v.needed) }} title={`${v.needed} yes needed`} />
      </div>
      <div className="pool-meta small">
        <span>Yes {v.yes} · No {v.no} · {v.needed} yes needed of {total}</span>
        {v.myVote && <span className="muted">You voted {v.myVote}</span>}
      </div>

      {canVote && (
        <div className="vote-btns">
          <button className={`btn btn-ghost${v.myVote === 'yes' ? ' on' : ''}`} disabled={busy !== null} aria-pressed={v.myVote === 'yes'} onClick={() => void vote('yes')}>
            {busy === 'yes' ? 'Saving...' : 'Yes'}
          </button>
          <button className={`btn btn-ghost${v.myVote === 'no' ? ' on' : ''}`} disabled={busy !== null} aria-pressed={v.myVote === 'no'} onClick={() => void vote('no')}>
            {busy === 'no' ? 'Saving...' : 'No'}
          </button>
        </div>
      )}
    </article>
  );
}
