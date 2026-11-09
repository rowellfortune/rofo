import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { makePool, renderAt } from '../../test/utils';
import type { Proposal } from '../../types';
import { ProposalCard } from './ProposalCard';

const proposal = (over: Partial<Proposal> = {}): Proposal => ({ id: 'pr', title: 'Hire a surveyor', detail: 'Cost 450 USD', votes: {}, ...over });
const pool4 = makePool({ members: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, monthly: 1, contributed: 0, joinedAt: '2026-01-01' })) });

test('shows the question, the detail and an honest threshold', () => {
  renderAt(<ProposalCard pool={pool4} proposal={proposal({ votes: { a: 'yes' } })} meId="a" canVote total={4} onVote={vi.fn()} />);
  expect(screen.getByText('Hire a surveyor')).toBeInTheDocument();
  expect(screen.getByText('Cost 450 USD')).toBeInTheDocument();
  expect(screen.getByText('Yes 1 · No 0 · 3 yes needed of 4')).toBeInTheDocument(); // more than half of 4 is 3
  expect(screen.getByText('Open')).toBeInTheDocument();
  expect(screen.getByText('You voted yes')).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAccessibleName('1 yes, 0 no, 3 yes needed');
});

test('reaching the threshold shows Passed, too many no votes shows Rejected', () => {
  const { unmount } = renderAt(<ProposalCard pool={pool4} proposal={proposal({ votes: { a: 'yes', b: 'yes', c: 'yes' } })} meId="a" canVote total={4} onVote={vi.fn()} />);
  expect(screen.getByText('Passed')).toHaveClass('ok');
  unmount();
  renderAt(<ProposalCard pool={pool4} proposal={proposal({ votes: { a: 'no', b: 'no' } })} meId="a" canVote total={4} onVote={vi.fn()} />);
  expect(screen.getByText('Rejected')).toHaveClass('bad'); // 2 no of 4: yes can reach at most 2, below 3
});

test('a server tally wins over the local votes', () => {
  const p = proposal({ votes: {}, tally: { yes: 2, no: 0, needed: 2, status: 'PASSED', myVote: 'no' } });
  renderAt(<ProposalCard pool={pool4} proposal={p} meId="a" canVote total={3} onVote={vi.fn()} />);
  expect(screen.getByText('Yes 2 · No 0 · 2 yes needed of 3')).toBeInTheDocument();
  expect(screen.getByText('You voted no')).toBeInTheDocument();
});

test('voting calls back with the choice and marks the pressed button', async () => {
  const onVote = vi.fn(async () => {});
  renderAt(<ProposalCard pool={pool4} proposal={proposal({ votes: { a: 'no' } })} meId="a" canVote total={4} onVote={onVote} />);
  expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  expect(onVote).toHaveBeenCalledWith('yes');
});

test('both buttons lock while a vote is saving, so it cannot be sent twice', async () => {
  let finish: () => void = () => {};
  const onVote = vi.fn(() => new Promise<void>((r) => { finish = r; }));
  renderAt(<ProposalCard pool={pool4} proposal={proposal()} meId="a" canVote total={4} onVote={onVote} />);
  await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
  finish();
  expect(await screen.findByRole('button', { name: 'Yes' })).toBeEnabled();
});

test('a failed vote unlocks the buttons again (the page shows the error)', async () => {
  renderAt(<ProposalCard pool={pool4} proposal={proposal()} meId="a" canVote total={4} onVote={vi.fn(async () => { throw new Error('nope'); })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  expect(await screen.findByRole('button', { name: 'Yes' })).toBeEnabled();
});

test('people who are not members see the tally but no buttons', () => {
  renderAt(<ProposalCard pool={pool4} proposal={proposal()} meId={null} canVote={false} total={4} onVote={vi.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(/You voted/)).not.toBeInTheDocument();
});
