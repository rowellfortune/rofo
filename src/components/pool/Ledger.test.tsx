import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderAt } from '../../test/utils';
import type { LedgerEntry } from '../../types';
import { Ledger } from './Ledger';

const names: Record<string, string> = { u1: 'Anita', u2: 'Kevin' };
const nameOf = (id: string) => names[id] ?? 'Member';
const entries: LedgerEntry[] = [
  { id: 'rev', memberId: 'u1', amount: -2000, date: '2026-02-02', note: 'wrong amount', reference: 'reversal of TYPO-1', reversalOf: 'typo' },
  { id: 'typo', memberId: 'u1', amount: 2000, date: '2026-02-01', note: 'meant 200', reference: 'TYPO-1', reversedAt: '2026-02-02T00:00:00.000Z' },
  { id: 'ok', memberId: 'u2', amount: 150, date: '2026-02-03', note: 'Contribution', reference: 'BANK-9' },
];

test('an empty ledger says so', () => {
  renderAt(<Ledger entries={[]} nameOf={nameOf} canReverse onReverse={vi.fn()} />);
  expect(screen.getByText('No payments yet.')).toBeInTheDocument();
});

test('every row shows date, member, note, reference and amount; reversals are negative', () => {
  renderAt(<Ledger entries={entries} nameOf={nameOf} canReverse={false} onReverse={vi.fn()} />);
  const [rev, typo, ok] = screen.getAllByRole('listitem');
  expect(rev).toHaveTextContent('Anita');
  expect(rev).toHaveTextContent('−$2,000');
  expect(rev).toHaveClass('is-reversal');
  expect(typo).toHaveClass('is-reversed');
  expect(within(typo).getByText('Reversed')).toBeInTheDocument();
  expect(ok).toHaveTextContent('2026-02-03');
  expect(ok).toHaveTextContent('Kevin');
  expect(ok).toHaveTextContent('ref BANK-9');
  expect(ok).toHaveTextContent('$150');
});

test('members never see Reverse buttons', () => {
  renderAt(<Ledger entries={entries} nameOf={nameOf} canReverse={false} onReverse={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument();
});

test('admins can reverse only live payments: not a reversed one, not a reversal', () => {
  renderAt(<Ledger entries={entries} nameOf={nameOf} canReverse onReverse={vi.fn()} />);
  const buttons = screen.getAllByRole('button', { name: 'Reverse' });
  expect(buttons).toHaveLength(1);
  expect(screen.getAllByRole('listitem')[2]).toContainElement(buttons[0]);
});

test('reversing needs a real reason, then sends it trimmed and closes the box', async () => {
  const onReverse = vi.fn(async () => {});
  renderAt(<Ledger entries={entries} nameOf={nameOf} canReverse onReverse={onReverse} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reverse' }));
  const confirm = screen.getByRole('button', { name: 'Confirm reversal' });
  expect(confirm).toBeDisabled();
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason for reversal' }), 'typo');
  expect(confirm).toBeDisabled(); // 4 characters is not a reason
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason for reversal' }), ' in amount  ');
  await userEvent.click(confirm);
  expect(onReverse).toHaveBeenCalledWith('ok', 'typo in amount');
  expect(screen.queryByRole('textbox', { name: 'Reason for reversal' })).not.toBeInTheDocument();
});

test('a failed reversal keeps the box open so the admin can retry', async () => {
  renderAt(<Ledger entries={entries} nameOf={nameOf} canReverse onReverse={vi.fn(async () => { throw new Error('balance too low'); })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reverse' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason for reversal' }), 'wrong amount');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm reversal' }));
  expect(await screen.findByRole('button', { name: 'Confirm reversal' })).toBeEnabled();
});

test('Cancel closes the reason box without sending', async () => {
  const onReverse = vi.fn();
  renderAt(<Ledger entries={entries} nameOf={nameOf} canReverse onReverse={onReverse} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reverse' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(onReverse).not.toHaveBeenCalled();
});
