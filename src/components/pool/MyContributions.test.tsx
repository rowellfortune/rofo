import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderAt } from '../../test/utils';
import type { LedgerEntry, PoolMember } from '../../types';
import { MyContributions } from './MyContributions';

const me: PoolMember = { id: 'me', name: 'Me', monthly: 200, contributed: 400, joinedAt: '2026-01-01' };
const row = (term: string) => screen.getByText(term).parentElement!;

test('shows paid in, share, monthly commitment and payment count', () => {
  renderAt(<MyContributions me={me} share={33.333} ledger={[]} />);
  expect(row('Paid in')).toHaveTextContent('$400');
  expect(row('Your share')).toHaveTextContent('33.3%');
  expect(row('Monthly commitment')).toHaveTextContent('$200');
  expect(row('Payments')).toHaveTextContent(/^Payments0$/); // no date when there are none
});

test('counts only real payments: not other members, not reversals, not reversed ones', () => {
  const ledger: LedgerEntry[] = [
    { id: '1', memberId: 'me', amount: 200, date: '2026-03-01', note: '' },
    { id: '2', memberId: 'me', amount: -500, date: '2026-02-20', note: '', reversalOf: '3' },
    { id: '3', memberId: 'me', amount: 500, date: '2026-02-10', note: '', reversedAt: '2026-02-20' },
    { id: '4', memberId: 'other', amount: 900, date: '2026-03-05', note: '' },
    { id: '5', memberId: 'me', amount: 200, date: '2026-01-01', note: '' },
  ];
  renderAt(<MyContributions me={me} share={50} ledger={ledger} />);
  expect(row('Payments')).toHaveTextContent('2 · last 2026-03-01'); // the newest real one, the list is newest first
});
