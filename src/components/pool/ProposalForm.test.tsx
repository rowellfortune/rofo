import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderAt } from '../../test/utils';
import { ProposalForm } from './ProposalForm';

const open = async () => userEvent.click(screen.getByRole('button', { name: 'New proposal' }));
const headline = () => screen.getByRole('textbox', { name: /What should the group decide/ });
const details = () => screen.getByRole('textbox', { name: 'Details (optional)' });

test('starts as a single button and opens into a form', async () => {
  renderAt(<ProposalForm onSubmit={vi.fn()} />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await open();
  expect(headline()).toBeInTheDocument();
  expect(details()).toBeInTheDocument();
});

test('a too short headline is refused on the page, nothing is sent', async () => {
  const onSubmit = vi.fn();
  renderAt(<ProposalForm onSubmit={onSubmit} />);
  await open();
  await userEvent.type(headline(), 'Hi');
  await userEvent.click(screen.getByRole('button', { name: 'Post proposal' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/at least 5 characters/);
  expect(onSubmit).not.toHaveBeenCalled();
});

test('typing again clears the error', async () => {
  renderAt(<ProposalForm onSubmit={vi.fn()} />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Post proposal' }));
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await userEvent.type(headline(), 'x');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a valid proposal is sent trimmed and the form closes', async () => {
  const onSubmit = vi.fn(async () => {});
  renderAt(<ProposalForm onSubmit={onSubmit} />);
  await open();
  await userEvent.type(headline(), '  Hire a surveyor  ');
  await userEvent.type(details(), ' Cost 450 USD ');
  await userEvent.click(screen.getByRole('button', { name: 'Post proposal' }));
  expect(onSubmit).toHaveBeenCalledWith({ title: 'Hire a surveyor', detail: 'Cost 450 USD' });
  expect(await screen.findByRole('button', { name: 'New proposal' })).toBeInTheDocument();
});

test('a server refusal is shown and the typed text is kept', async () => {
  renderAt(<ProposalForm onSubmit={vi.fn(async () => { throw new Error('Only members can propose'); })} />);
  await open();
  await userEvent.type(headline(), 'Hire a surveyor');
  await userEvent.click(screen.getByRole('button', { name: 'Post proposal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Only members can propose');
  expect(headline()).toHaveValue('Hire a surveyor');
});

test('Cancel closes without sending', async () => {
  const onSubmit = vi.fn();
  renderAt(<ProposalForm onSubmit={onSubmit} />);
  await open();
  await userEvent.type(headline(), 'Something');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'New proposal' })).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});
