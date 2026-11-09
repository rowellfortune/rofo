import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, userWith } from '../test/mocks';
import { currentUrl, renderAt } from '../test/utils';
import { Header } from './Header';

// The header reads the signed in user from the auth context. Swap it per test.
const auth = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').authValue> }));
vi.mock('../state/AuthContext', () => ({ useAuth: () => auth.value }));

beforeEach(() => { auth.value = authValue(); });

describe('Header', () => {
  test('a guest sees Log in and "List a property", which leads to the agent application', () => {
    renderAt(<Header />);
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'List a property' })).toHaveAttribute('href', '/agent/apply');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Applications' })).not.toBeInTheDocument();
  });

  test('a signed in buyer sees their email linking to the account page, and can sign out', async () => {
    auth.value = authValue({ user: userWith(['Client']) });
    renderAt(<Header />);
    expect(screen.getByRole('link', { name: 'me@rofo.test' })).toHaveAttribute('href', '/account');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.value.signOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  test('an agent gets a Dashboard button instead of "List a property"', () => {
    auth.value = authValue({ user: userWith(['Client', 'Agent']) });
    renderAt(<Header />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/agent');
    expect(screen.queryByRole('link', { name: 'Applications' })).not.toBeInTheDocument();
  });

  test('an admin also sees the Applications link (the page itself checks two step verification)', () => {
    auth.value = authValue({ user: userWith(['Admin']) });
    renderAt(<Header />);
    expect(screen.getByRole('link', { name: 'Applications' })).toHaveAttribute('href', '/admin/applications');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument(); // admins can use agent tools
  });

  test('Buy and Rent are only marked active for their own deal on the results page', () => {
    renderAt(<Header />, { route: '/search?deal=rent' });
    expect(screen.getByRole('link', { name: 'Rent' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Buy' })).not.toHaveClass('active');
  });

  test('on other pages neither Buy nor Rent is active', () => {
    renderAt(<Header />, { route: '/pools?deal=buy' });
    expect(screen.getByRole('link', { name: 'Buy' })).not.toHaveClass('active');
  });

  test('the logo goes home', async () => {
    renderAt(<Header />, { route: '/pools' });
    await userEvent.click(screen.getByRole('link', { name: 'RoFo estate home' }));
    expect(currentUrl()).toBe('/');
  });
});
