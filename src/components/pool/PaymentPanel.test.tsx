import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderAt } from '../../test/utils';
import type { PoolMember } from '../../types';
import { PaymentPanel } from './PaymentPanel';

const members: PoolMember[] = [
  { id: 'u1', name: 'Anita', monthly: 200, contributed: 0, joinedAt: '2026-01-01' },
  { id: 'u2', name: 'Kevin', monthly: 150, contributed: 0, joinedAt: '2026-01-01' },
];
const field = (name: string) => screen.getByRole('textbox', { name });
const fill = async (member: string, amount: string, ref: string, note = '') => {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Member' }), member);
  await userEvent.type(field('Amount (USD)'), amount);
  await userEvent.type(field('Escrow or bank reference'), ref);
  if (note) await userEvent.type(field('Note (optional)'), note);
};
let confirmSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true); });

test('an empty form shows every problem and records nothing', async () => {
  const onRecord = vi.fn();
  renderAt(<PaymentPanel members={members} onRecord={onRecord} />);
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getAllByRole('alert').map((e) => e.textContent)).toEqual([
    'Choose a member', 'Enter an amount above 0, up to 2 decimals', 'Enter the escrow or bank reference, at least 3 characters',
  ]);
  expect(onRecord).not.toHaveBeenCalled();
  expect(confirmSpy).not.toHaveBeenCalled();
});

test('risky amounts are refused before anything is sent', async () => {
  const onRecord = vi.fn();
  renderAt(<PaymentPanel members={members} onRecord={onRecord} />);
  await fill('u1', '1e3', 'BANK-1');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount above 0');
  expect(onRecord).not.toHaveBeenCalled();
});

test('asks for confirmation naming the member, amount and reference, then records it', async () => {
  const onRecord = vi.fn(async () => {});
  renderAt(<PaymentPanel members={members} onRecord={onRecord} />);
  await fill('u2', '1,250.50', '  BANK-7781 ', 'first payment');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Record \$1,251 for Kevin\?\nReference: BANK-7781/));
  expect(onRecord).toHaveBeenCalledWith({ userId: 'u2', amount: 1250.5, reference: 'BANK-7781', note: 'first payment' });
  expect(await screen.findByRole('status')).toHaveTextContent('Recorded $1,251 for Kevin.');
  // amount, reference and note are cleared so the next payment starts fresh
  expect(field('Amount (USD)')).toHaveValue('');
  expect(field('Escrow or bank reference')).toHaveValue('');
});

test('no note is sent as undefined, not as an empty string', async () => {
  const onRecord = vi.fn(async () => {});
  renderAt(<PaymentPanel members={members} onRecord={onRecord} />);
  await fill('u1', '200', 'BANK-2');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(onRecord).toHaveBeenCalledWith({ userId: 'u1', amount: 200, reference: 'BANK-2', note: undefined });
});

test('saying No at the confirmation records nothing', async () => {
  confirmSpy.mockReturnValue(false);
  const onRecord = vi.fn();
  renderAt(<PaymentPanel members={members} onRecord={onRecord} />);
  await fill('u1', '200', 'BANK-3');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(onRecord).not.toHaveBeenCalled();
});

test('a duplicate reference from the server is shown next to the form, values kept for correcting', async () => {
  renderAt(<PaymentPanel members={members} onRecord={vi.fn(async () => { throw new Error('A payment with this reference was already recorded'); })} />);
  await fill('u1', '200', 'BANK-4');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already recorded');
  expect(field('Escrow or bank reference')).toHaveValue('BANK-4');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
