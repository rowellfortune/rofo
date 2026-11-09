import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { poolsValue } from '../test/mocks';
import { makeListing, makePool, renderAt } from '../test/utils';
import { PoolBuyPanel } from './PoolBuyPanel';

const pools = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').poolsValue> }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => pools.value }));
beforeEach(() => { pools.value = poolsValue(); });

const sliders = () => screen.getAllByRole('slider');

test('shows the goal and the monthly amount per person, defaulting to 5 people over 24 months', () => {
  renderAt(<PoolBuyPanel listing={makeListing({ id: 'h', price: 120_000 })} />);
  expect(screen.getByText(/\$30,000/)).toBeInTheDocument(); // 25% of 120,000
  expect(screen.getByText('$250', { exact: false })).toBeInTheDocument(); // 30,000 / 5 / 24
  expect(screen.getByRole('link', { name: 'Start a pool' })).toHaveAttribute('href', '/pools/new?listing=h&members=5&months=24');
});

test('moving the sliders recalculates and carries the choice into "Start a pool"', () => {
  renderAt(<PoolBuyPanel listing={makeListing({ id: 'h', price: 120_000 })} />);
  fireEvent.change(sliders()[0], { target: { value: '10' } });
  fireEvent.change(sliders()[1], { target: { value: '12' } });
  expect(screen.getByText('$250', { exact: false })).toBeInTheDocument(); // 30,000 / 10 / 12
  expect(screen.getByRole('link', { name: 'Start a pool' })).toHaveAttribute('href', '/pools/new?listing=h&members=10&months=12');
});

test('lists open pools for this home only', () => {
  pools.value = poolsValue({ pools: [makePool({ id: 'a', name: 'Pool A', listingId: 'h' }), makePool({ id: 'b', name: 'Other home', listingId: 'x' })] });
  renderAt(<PoolBuyPanel listing={makeListing({ id: 'h' })} />);
  expect(screen.getByText('1 open pool for this home')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Pool A' })).toHaveAttribute('href', '/pools/a');
  expect(screen.queryByRole('link', { name: 'Other home' })).not.toBeInTheDocument();
});

test('says "pools" for more than one', () => {
  pools.value = poolsValue({ pools: [makePool({ id: 'a', listingId: 'h' }), makePool({ id: 'b', listingId: 'h' })] });
  renderAt(<PoolBuyPanel listing={makeListing({ id: 'h' })} />);
  expect(screen.getByText('2 open pools for this home')).toBeInTheDocument();
});

test('shows nothing for rentals, you cannot pool to rent', () => {
  const { container } = renderAt(<PoolBuyPanel listing={makeListing({ deal: 'rent' })} />);
  expect(container.querySelector('.pool-panel')).toBeNull();
});
