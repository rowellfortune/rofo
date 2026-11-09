import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue } from '../../test/mocks';
import { makeListing, renderAt } from '../../test/utils';
import { AgentDashboard } from './AgentDashboard';

const h = vi.hoisted(() => ({
  auth: {} as ReturnType<typeof import('../../test/mocks').authValue>,
  api: { apiMyListings: vi.fn(), apiDeleteListing: vi.fn() },
}));
vi.mock('../../api/agent', () => h.api);
vi.mock('../../state/AuthContext', () => ({ useAuth: () => h.auth }));

const a = makeListing({ id: 'a', address: 'Kerkplein 1', imageKeys: ['k1', 'k2'] });
const b = makeListing({ id: 'b', address: 'Waterkant 9', deal: 'rent', lat: NaN, lng: NaN });
beforeEach(() => {
  h.auth = authValue();
  h.api.apiMyListings.mockResolvedValue([a, b]);
  h.api.apiDeleteListing.mockResolvedValue(undefined);
});

describe('AgentDashboard', () => {
  test('loading, then one row per listing with photo count and pin state', async () => {
    renderAt(<AgentDashboard />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('2 listings')).toBeInTheDocument();
    const [rowA, rowB] = screen.getAllByRole('row').slice(1);
    expect(rowA).toHaveTextContent('Kerkplein 1');
    expect(within(rowA).getByText('2')).toBeInTheDocument();
    expect(rowA).toHaveTextContent('Pinned');
    expect(rowB).toHaveTextContent('For rent');
    expect(rowB).toHaveTextContent('Not set');
    expect(within(rowA).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/agent/a/edit');
    expect(within(rowA).getByRole('link', { name: 'Inquiries' })).toHaveAttribute('href', '/agent/a/inquiries');
  });

  test('warns about listings without a map pin', async () => {
    renderAt(<AgentDashboard />);
    expect(await screen.findByText(/1 listing has no map location/)).toBeInTheDocument();
  });

  test('a hidden listing is marked and not linked to the public page', async () => {
    h.api.apiMyListings.mockResolvedValue([{ ...a, suspended: true }]);
    renderAt(<AgentDashboard />);
    expect(await screen.findByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kerkplein 1' })).not.toBeInTheDocument();
    expect(screen.getByText('1 listing')).toBeInTheDocument();
  });

  test('no listings: an empty state with a create link', async () => {
    h.api.apiMyListings.mockResolvedValue([]);
    renderAt(<AgentDashboard />);
    expect(await screen.findByRole('heading', { name: 'No listings yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a listing' })).toHaveAttribute('href', '/agent/new');
  });

  test('delete asks first, then removes the row', async () => {
    const user = userEvent.setup();
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt(<AgentDashboard />);
    const row = (await screen.findByText('Kerkplein 1')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(ask).toHaveBeenCalledWith('Delete "Kerkplein 1"? This cannot be undone.');
    expect(h.api.apiDeleteListing).not.toHaveBeenCalled();
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(h.api.apiDeleteListing).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.queryByText('Kerkplein 1')).not.toBeInTheDocument());
    expect(screen.getByText('1 listing')).toBeInTheDocument();
  });

  test('a failed delete keeps the row and shows why', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.apiDeleteListing.mockRejectedValue(new Error('Not your listing'));
    renderAt(<AgentDashboard />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not your listing');
    expect(screen.getByText('Kerkplein 1')).toBeInTheDocument();
    expect(h.auth.refresh).not.toHaveBeenCalled();
  });

  test('revoked access: a clear message and a session refresh', async () => {
    h.api.apiMyListings.mockRejectedValue(new Error('Your agent access was revoked'));
    renderAt(<AgentDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your agent access was removed.');
    expect(h.auth.refresh).toHaveBeenCalledOnce();
  });
});
