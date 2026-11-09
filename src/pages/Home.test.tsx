import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { listings } from '../data/listings';
import { poolsValue } from '../test/mocks';
import { makePool, renderAt } from '../test/utils';
import { Home } from './Home';

// The pools context is replaced so each test picks its own pools.
const pools = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').poolsValue> }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => pools.value }));
beforeEach(() => { pools.value = poolsValue(); });

describe('Home', () => {
  test('stats count the demo listings, countries and open pools', () => {
    pools.value = poolsValue({ pools: [makePool({ listingId: 'l1' }), makePool({ id: 'p2', listingId: 'l2' })] });
    renderAt(<Home />);
    const stats = document.querySelector('.hero-stats') as HTMLElement;
    const countries = new Set(listings.map((l) => l.country)).size;
    expect(within(stats).getByText(String(listings.length)).nextSibling).toHaveTextContent('Active listings');
    expect(within(stats).getByText(String(countries)).nextSibling).toHaveTextContent('Countries');
    expect(within(stats).getByText('2').nextSibling).toHaveTextContent('Open buying pools');
  });

  test('feature cards link to search, pools and the agent application', () => {
    renderAt(<Home />);
    expect(screen.getByRole('link', { name: 'Browse listings →' })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: 'See buying pools →' })).toHaveAttribute('href', '/pools');
    expect(screen.getByRole('link', { name: 'Become an agent →' })).toHaveAttribute('href', '/agent/apply');
  });

  test('popular places link to a search for that city', () => {
    renderAt(<Home />);
    expect(screen.getByRole('link', { name: /Punta Cana/ })).toHaveAttribute('href', '/search?q=Punta%20Cana');
  });

  test('"New and open this weekend" only shows new listings or open houses, at most four', () => {
    renderAt(<Home />);
    const section = screen.getByRole('heading', { name: 'New and open this weekend' }).closest('section') as HTMLElement;
    const cards = section.querySelectorAll('.grid > *');
    const expected = listings.filter((l) => l.isNew || l.openHouse).slice(0, 4);
    expect(cards).toHaveLength(expected.length);
    expect(within(section).getByText(expected[0].address, { exact: false })).toBeInTheDocument();
  });

  test('no pools: the preview pool card is left out and the stat shows 0', () => {
    renderAt(<Home />);
    expect(document.querySelector('.pool-mini')).toBeNull();
    expect(within(document.querySelector('.hero-stats') as HTMLElement).getByText('0')).toBeInTheDocument();
  });
});
