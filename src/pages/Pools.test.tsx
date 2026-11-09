import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { poolsValue } from '../test/mocks';
import { makePool, renderAt } from '../test/utils';
import { Pools } from './Pools';

const pools = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').poolsValue> }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => pools.value }));
beforeEach(() => { pools.value = poolsValue(); });

describe('Pools', () => {
  test('explains the four steps and links to the form', () => {
    renderAt(<Pools />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Start a pool' })).toHaveAttribute('href', '/pools/new');
  });

  test('lists each open pool', () => {
    pools.value = poolsValue({ pools: [makePool({ listingId: 'l1' }), makePool({ id: 'p2', name: 'Bay Fund', listingId: 'l2' })] });
    renderAt(<Pools />);
    expect(screen.getByText('Canal Home Fund')).toBeInTheDocument();
    expect(screen.getByText('Bay Fund')).toBeInTheDocument();
  });

  test('empty list invites the first pool', () => {
    renderAt(<Pools />);
    expect(screen.getByText('No open pools yet. Start the first one.')).toBeInTheDocument();
  });

  test('loading with nothing yet', () => {
    pools.value = poolsValue({ loading: true });
    renderAt(<Pools />);
    expect(screen.getByText('Loading pools...')).toBeInTheDocument();
  });

  test('signed out in API mode: a sign in link instead of the list', () => {
    pools.value = poolsValue({ needsAuth: true, pools: [makePool({ listingId: 'l1' })] });
    renderAt(<Pools />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=/pools');
    expect(screen.queryByText('Canal Home Fund')).not.toBeInTheDocument();
  });

  test('an error shows with a Dismiss button that clears it', async () => {
    pools.value = poolsValue({ error: 'Network down' });
    renderAt(<Pools />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(pools.value.clearError).toHaveBeenCalledOnce();
  });
});
