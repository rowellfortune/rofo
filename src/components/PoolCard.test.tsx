import { screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { makeListing, makePool, renderAt } from '../test/utils';
import type { Listing } from '../types';
import { PoolCard } from './PoolCard';

// The card looks up its listing through a hook. Control what it finds.
const found = vi.hoisted(() => ({ listing: undefined as Listing | undefined }));
vi.mock('../hooks/useListings', () => ({ useListing: () => ({ data: found.listing, loading: false, error: null }) }));
beforeEach(() => { found.listing = makeListing({ id: 'l-pool', price: 100_000, address: 'Canal Road 9' }); });

test('shows name, home, progress toward the 25% goal and open seats', () => {
  renderAt(<PoolCard pool={makePool()} />); // raised 800 of 25,000, 2 of 4 seats
  expect(screen.getByRole('link')).toHaveAttribute('href', '/pools/p1');
  expect(screen.getByText('Canal Home Fund')).toBeInTheDocument();
  expect(screen.getByText(/Canal Road 9, Paramaribo/)).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3'); // 800 / 25,000 rounds to 3%
  expect(screen.getByText('$800')).toBeInTheDocument();
  expect(screen.getByText('2 seats open')).toBeInTheDocument();
  expect(screen.getByText('Forming')).toBeInTheDocument();
});

test('one seat and full pools', () => {
  const { unmount } = renderAt(<PoolCard pool={makePool({ maxMembers: 3 })} />);
  expect(screen.getByText('1 seat open')).toBeInTheDocument();
  unmount();
  renderAt(<PoolCard pool={makePool({ maxMembers: 2 })} />);
  expect(screen.getByText('Full')).toBeInTheDocument();
  expect(screen.getByText('Saving')).toBeInTheDocument();
});

test('progress never shows above 100%, and a funded pool says Ready to buy', () => {
  const rich = makePool({ members: [{ id: 'u1', name: 'A', monthly: 1, contributed: 40_000, joinedAt: '2026-01-01' }] });
  renderAt(<PoolCard pool={rich} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  expect(screen.getByText('Ready to buy')).toBeInTheDocument();
});

test('uses server totals when member details are private', () => {
  const summary = makePool({ members: [], ledger: [], summary: { raised: 12_500, goal: 25_000, memberCount: 3, viewerIsMember: false } });
  renderAt(<PoolCard pool={summary} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByText('1 seat open')).toBeInTheDocument();
});

test('renders nothing when the home cannot be found (hidden or deleted)', () => {
  found.listing = undefined;
  const { container } = renderAt(<PoolCard pool={makePool()} />);
  expect(container.querySelector('.pool-card')).toBeNull();
});
