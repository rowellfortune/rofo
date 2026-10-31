/** Validation for the pool forms. Mirrors the server rules in backend/lib/pools.ts. */

export interface ProposalInput { title: string; detail: string }
export interface PaymentInput { userId: string; amount: number; reference: string; note: string }

type Result<T> = { ok: true; input: T } | { ok: false; errors: Record<string, string> };

/** A proposal needs a clear headline (5 to 120) and optional detail (up to 1000). */
export function buildProposal(title: string, detail: string): Result<ProposalInput> {
  const errors: Record<string, string> = {};
  const t = title.trim(), d = detail.trim();
  if (t.length < 5) errors.title = 'Give it a clear headline, at least 5 characters';
  else if (t.length > 120) errors.title = 'Keep the headline under 120 characters';
  if (d.length > 1000) errors.detail = 'Keep the detail under 1000 characters';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, input: { title: t, detail: d } };
}

/**
 * Parse a money amount typed by a person. Accepts "200", "1,250.50" and "$300".
 * Rejects zero, negatives, junk, and more than 2 decimals. Returns null when invalid.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= 10_000_000 ? n : null;
}

/** An admin recording a confirmed payment. The reference is required so every credit can be traced. */
export function buildPayment(f: { userId: string; amount: string; reference: string; note: string }): Result<PaymentInput> {
  const errors: Record<string, string> = {};
  if (!f.userId) errors.userId = 'Choose a member';
  const amount = parseAmount(f.amount);
  if (amount === null) errors.amount = 'Enter an amount above 0, up to 2 decimals';
  const reference = f.reference.trim();
  if (reference.length < 3) errors.reference = 'Enter the escrow or bank reference, at least 3 characters';
  else if (reference.length > 80) errors.reference = 'Keep the reference under 80 characters';
  if (f.note.trim().length > 120) errors.note = 'Keep the note under 120 characters';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input: { userId: f.userId, amount: amount!, reference, note: f.note.trim() } };
}

/** A reversal needs a reason the next admin can understand. */
export const validReason = (reason: string): boolean => reason.trim().length >= 5;
