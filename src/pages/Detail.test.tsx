import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getListing } from '../data/listings';
import { authValue, poolsValue, userWith } from '../test/mocks';
import { renderAt } from '../test/utils';
import { Detail } from './Detail';

// Demo mode (no VITE_ settings in tests): listings come from the mock data, nothing is sent.
const auth = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').authValue> }));
vi.mock('../state/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => poolsValue() }));
vi.mock('../components/ResultsMap', () => ({ ResultsMap: () => <div data-testid="map" /> }));
beforeEach(() => { auth.value = authValue(); });

const l1 = getListing('l1')!;
const open = (id = 'l1') => renderAt(<Detail />, { route: `/property/${id}`, path: '/property/:id' });

describe('Detail (demo mode)', () => {
  test('shows address, price, features, facts and the map', () => {
    open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(l1.address);
    expect(screen.getByText('$1,850,000')).toBeInTheDocument();
    for (const f of l1.features) expect(screen.getByText(f)).toBeInTheDocument();
    expect(screen.getByText('Living area').nextSibling).toHaveTextContent(`${l1.areaM2} m²`);
    expect(screen.getByText('Listing').nextSibling).toHaveTextContent('For sale');
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  test('a listing without plot or year leaves those facts out', () => {
    open('l3'); // apartment for rent, no plot
    expect(screen.queryByText('Plot')).not.toBeInTheDocument();
    expect(screen.getByText('Listing').nextSibling).toHaveTextContent('For rent');
  });

  test('unknown id: not found with a way back', () => {
    open('nope');
    expect(screen.getByRole('heading', { name: 'Property not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to search' })).toHaveAttribute('href', '/search');
  });

  test('Save toggles locally', async () => {
    const user = userEvent.setup();
    open();
    const btn = screen.getByRole('button', { name: '♡ Save' });
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('♥ Saved');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  test('the contact form prefills the signed in user and fakes success', async () => {
    const user = userEvent.setup();
    auth.value = authValue({ user: userWith() });
    open();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Me Myself');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('me@rofo.test');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(`I am interested in ${l1.address}.`);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByText(`Thanks. ${l1.agent.name} will reply soon.`)).toBeInTheDocument();
  });

  test('the call button dials the agent', () => {
    open();
    expect(screen.getByRole('link', { name: `Call ${l1.agent.phone}` })).toHaveAttribute('href', `tel:${l1.agent.phone}`);
  });
});
