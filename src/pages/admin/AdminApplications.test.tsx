import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { makeApplication, renderAt } from '../../test/utils';
import { AdminApplications } from './AdminApplications';

const h = vi.hoisted(() => ({ apiListApplications: vi.fn(), apiReviewApplication: vi.fn(), apiRevokeAgent: vi.fn() }));
vi.mock('../../api/applications', () => h);

const pending = makeApplication();
const approved = makeApplication({ userId: 'u-ok', name: 'Bea Broker', status: 'APPROVED' });
beforeEach(() => {
  h.apiListApplications.mockImplementation(async (s: string) => (s === 'PENDING' ? [pending] : s === 'APPROVED' ? [approved] : []));
  h.apiReviewApplication.mockResolvedValue(undefined);
  h.apiRevokeAgent.mockResolvedValue({ listingsHidden: 3, listingsFailed: 0 });
});

describe('AdminApplications: pending', () => {
  test('starts on Pending and shows the application details', async () => {
    renderAt(<AdminApplications />);
    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Alex Agent · Alex Realty')).toBeInTheDocument();
    expect(screen.getByText('KKF-9')).toBeInTheDocument();
    expect(h.apiListApplications).toHaveBeenCalledWith('PENDING');
  });

  test('Approve sends the decision and drops the row', async () => {
    renderAt(<AdminApplications />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(h.apiReviewApplication).toHaveBeenCalledWith('u-app', 'APPROVED', undefined);
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });

  test('Reject needs a reason of 5+ characters', async () => {
    const user = userEvent.setup();
    renderAt(<AdminApplications />);
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const send = screen.getByRole('button', { name: 'Send rejection' });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Rejection reason' }), 'No licence attached');
    await user.click(send);
    expect(h.apiReviewApplication).toHaveBeenCalledWith('u-app', 'REJECTED', 'No licence attached');
  });

  test('a failed decision keeps the row and shows the error', async () => {
    h.apiReviewApplication.mockRejectedValue(new Error('Already reviewed'));
    renderAt(<AdminApplications />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already reviewed');
    expect(screen.getByText('Alex Agent · Alex Realty')).toBeInTheDocument();
  });

  test('an earlier revocation is pointed out to the reviewer', async () => {
    h.apiListApplications.mockResolvedValue([makeApplication({ priorRevocationNote: 'Fake listings', priorRevocationAt: '2026-02-01T00:00:00.000Z' })]);
    renderAt(<AdminApplications />);
    expect(await screen.findByRole('note')).toHaveTextContent('Lost agent access before');
    expect(screen.getByRole('note')).toHaveTextContent('Fake listings');
  });

  test('a list error is shown instead of "Nothing here"', async () => {
    h.apiListApplications.mockRejectedValue(new Error('Forbidden'));
    renderAt(<AdminApplications />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(screen.queryByText('Nothing here.')).not.toBeInTheDocument();
  });
});

describe('AdminApplications: revoking', () => {
  const openRevoke = async (user: ReturnType<typeof userEvent.setup>) => {
    renderAt(<AdminApplications />);
    await user.click(screen.getByRole('tab', { name: 'Approved' }));
    const card = (await screen.findByText(/Bea Broker/)).closest('article') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Revoke access' }));
    return card;
  };

  test('needs a reason, hides listings by default, reports the count', async () => {
    const user = userEvent.setup();
    const card = await openRevoke(user);
    const confirm = within(card).getByRole('button', { name: 'Revoke access' });
    expect(confirm).toBeDisabled();
    expect(within(card).getByRole('checkbox')).toBeChecked();
    await user.type(within(card).getByRole('textbox', { name: 'Reason for revoking access' }), '  Licence expired  ');
    await user.click(confirm);
    expect(h.apiRevokeAgent).toHaveBeenCalledWith('u-ok', 'Licence expired', true);
    expect(await screen.findByRole('status')).toHaveTextContent('Access revoked for Bea Broker. 3 listings hidden.');
  });

  test('unticking keeps listings visible', async () => {
    const user = userEvent.setup();
    const card = await openRevoke(user);
    await user.click(within(card).getByRole('checkbox'));
    await user.type(within(card).getByRole('textbox'), 'Asked to leave');
    await user.click(within(card).getByRole('button', { name: 'Revoke access' }));
    expect(h.apiRevokeAgent).toHaveBeenCalledWith('u-ok', 'Asked to leave', false);
    expect(await screen.findByRole('status')).toHaveTextContent('Their listings stay visible.');
  });

  test('a partial failure tells the admin to finish by hand', async () => {
    const user = userEvent.setup();
    h.apiRevokeAgent.mockResolvedValue({ listingsHidden: 1, listingsFailed: 2 });
    const card = await openRevoke(user);
    await user.type(within(card).getByRole('textbox'), 'Licence expired');
    await user.click(within(card).getByRole('button', { name: 'Revoke access' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 listing hidden. 2 could not be hidden. Check the logs');
  });

  test('Cancel closes the box without calling the server', async () => {
    const user = userEvent.setup();
    const card = await openRevoke(user);
    await user.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
    expect(h.apiRevokeAgent).not.toHaveBeenCalled();
  });

  test('switching tabs reloads that status', async () => {
    const user = userEvent.setup();
    renderAt(<AdminApplications />);
    await user.click(screen.getByRole('tab', { name: 'Revoked' }));
    await waitFor(() => expect(h.apiListApplications).toHaveBeenLastCalledWith('REVOKED'));
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });
});
