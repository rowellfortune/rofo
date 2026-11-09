import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { listings } from '../data/listings';
import { formatPrice } from '../lib/format';
import { monthlyPerMember } from '../lib/pools';
import { poolsValue } from '../test/mocks';
import { currentUrl, renderAt } from '../test/utils';
import { NewPool } from './NewPool';

const pools = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').poolsValue> }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => pools.value }));
beforeEach(() => { pools.value = poolsValue(); });

const buyable = listings.filter((l) => l.deal === 'buy');
const each = (price: number, members: number, months: number) => formatPrice(monthlyPerMember(price, members, months), 'buy');

describe('NewPool', () => {
  test('signed out: asks to sign in first', () => {
    pools.value = poolsValue({ needsAuth: true });
    renderAt(<NewPool />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=/pools/new');
    expect(screen.queryByRole('button', { name: 'Create pool' })).not.toBeInTheDocument();
  });

  test('only homes for sale are offered, and the first is picked by default', () => {
    renderAt(<NewPool />);
    const select = screen.getByRole('combobox');
    expect(select.querySelectorAll('option')).toHaveLength(buyable.length);
    expect(select).toHaveValue(buyable[0].id);
    expect(document.querySelector('.pool-each')).toHaveTextContent(each(buyable[0].price, 5, 24));
  });

  test('a link from a listing prefills home, members and months', () => {
    const home = buyable[1];
    renderAt(<NewPool />, { route: `/pools/new?listing=${home.id}&members=4&months=12` });
    expect(screen.getByRole('combobox')).toHaveValue(home.id);
    expect(screen.getByText('Members:')).toHaveTextContent('Members: 4');
    expect(document.querySelector('.pool-each')).toHaveTextContent(each(home.price, 4, 12));
  });

  test('moving the sliders updates the monthly amount', () => {
    renderAt(<NewPool />);
    const [members, months] = screen.getAllByRole('slider');
    fireEvent.change(members, { target: { value: '10' } });
    fireEvent.change(months, { target: { value: '48' } });
    expect(document.querySelector('.pool-each')).toHaveTextContent(each(buyable[0].price, 10, 48));
  });

  test('submit creates the pool with a default name and opens it', async () => {
    const user = userEvent.setup();
    renderAt(<NewPool />, { route: '/pools/new' });
    await user.click(screen.getByRole('button', { name: 'Create pool' }));
    expect(pools.value.createPool).toHaveBeenCalledWith({
      name: `${buyable[0].city} Home Fund`, listingId: buyable[0].id, maxMembers: 5, targetMonths: 24,
      monthly: monthlyPerMember(buyable[0].price, 5, 24),
    });
    await waitFor(() => expect(currentUrl()).toBe('/pools/new-pool'));
  });

  test('a typed name is trimmed', async () => {
    const user = userEvent.setup();
    renderAt(<NewPool />);
    await user.type(screen.getByRole('textbox'), '  Sunset Crew  ');
    await user.click(screen.getByRole('button', { name: 'Create pool' }));
    expect(pools.value.createPool).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sunset Crew' }));
  });

  test('a failed create shows the reason and stays on the form', async () => {
    const user = userEvent.setup();
    pools.value = poolsValue({ createPool: vi.fn(async () => { throw new Error('You already run a pool'); }) });
    renderAt(<NewPool />, { route: '/pools/new' });
    await user.click(screen.getByRole('button', { name: 'Create pool' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You already run a pool');
    expect(currentUrl()).toBe('/pools/new');
    expect(screen.getByRole('button', { name: 'Create pool' })).toBeEnabled();
  });
});
