import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, poolsValue, userWith } from '../test/mocks';
import { makeListing, renderAt } from '../test/utils';
import { Detail } from './Detail';

// API mode: the backend calls and the listing hook are replaced with spies.
vi.mock('../api/config', () => ({ apiEnabled: true, apiConfig: {} }));
const h = vi.hoisted(() => ({
  listing: { data: undefined as unknown, loading: false, error: null as string | null },
  auth: {} as ReturnType<typeof import('../test/mocks').authValue>,
  api: {
    apiFavoriteIds: vi.fn(async () => [] as string[]),
    apiToggleFavorite: vi.fn(async () => true),
    apiSendInquiry: vi.fn(async () => {}),
  },
}));
vi.mock('../hooks/useListings', () => ({ useListing: () => h.listing }));
vi.mock('../api/listings', () => h.api);
vi.mock('../state/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => poolsValue() }));
vi.mock('../components/ResultsMap', () => ({ ResultsMap: () => null }));

const home = makeListing({ id: 'x1', address: 'Kerkplein 1' });
beforeEach(() => {
  h.listing = { data: home, loading: false, error: null };
  h.auth = authValue();
  h.api.apiFavoriteIds.mockResolvedValue([]);
  h.api.apiToggleFavorite.mockResolvedValue(true);
  h.api.apiSendInquiry.mockResolvedValue(undefined);
});
const open = () => renderAt(<Detail />, { route: '/property/x1', path: '/property/:id' });

describe('Detail (API mode)', () => {
  test('loading and error states', () => {
    h.listing = { data: undefined, loading: true, error: null };
    const { unmount } = open();
    expect(screen.getByText('Loading property...')).toBeInTheDocument();
    unmount();
    h.listing = { data: undefined, loading: false, error: 'Timeout' };
    open();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this property. Timeout');
  });

  test('signed out: Save is disabled and the form becomes a sign in link back here', () => {
    open();
    expect(screen.getByRole('button', { name: '♡ Save' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Sign in to contact the agent' })).toHaveAttribute('href', '/login?next=%2Fproperty%2Fx1');
    expect(h.api.apiFavoriteIds).not.toHaveBeenCalled();
  });

  test('signed in: an already saved listing shows as saved', async () => {
    h.auth = authValue({ user: userWith() });
    h.api.apiFavoriteIds.mockResolvedValue(['x1']);
    open();
    expect(await screen.findByRole('button', { name: '♥ Saved' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Save uses the answer from the server', async () => {
    h.auth = authValue({ user: userWith() });
    open();
    await userEvent.click(screen.getByRole('button', { name: '♡ Save' }));
    expect(h.api.apiToggleFavorite).toHaveBeenCalledWith('x1');
    expect(await screen.findByRole('button', { name: '♥ Saved' })).toBeInTheDocument();
  });

  test('a failed save shows the error', async () => {
    h.auth = authValue({ user: userWith() });
    h.api.apiToggleFavorite.mockRejectedValue(new Error('Rate limited'));
    open();
    await userEvent.click(screen.getByRole('button', { name: '♡ Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limited');
  });

  test('the inquiry is sent with what the buyer typed', async () => {
    const user = userEvent.setup();
    h.auth = authValue({ user: userWith() });
    open();
    const msg = screen.getByRole('textbox', { name: 'Message' });
    await user.clear(msg);
    await user.type(msg, 'Can I visit on Friday?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(h.api.apiSendInquiry).toHaveBeenCalledWith({ listingId: 'x1', name: 'Me Myself', email: 'me@rofo.test', message: 'Can I visit on Friday?' });
    expect(await screen.findByText(/will reply soon/)).toBeInTheDocument();
  });

  test('a failed inquiry keeps the form and shows why', async () => {
    h.auth = authValue({ user: userWith() });
    h.api.apiSendInquiry.mockRejectedValue(new Error('Too many messages today'));
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many messages today');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
  });
});
