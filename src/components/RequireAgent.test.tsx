import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, userWith } from '../test/mocks';
import { renderAt } from '../test/utils';
import { isAdmin, isAgent, RequireAdmin, RequireAgent } from './RequireAgent';

const auth = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').authValue> }));
vi.mock('../state/AuthContext', () => ({ useAuth: () => auth.value }));
beforeEach(() => { auth.value = authValue(); });

const Secret = () => <p>secret page</p>;

describe('group helpers', () => {
  test('isAgent: agents and admins', () => {
    expect(isAgent(['Agent'])).toBe(true);
    expect(isAgent(['Admin'])).toBe(true);
    expect(isAgent(['Client'])).toBe(false);
    expect(isAgent(undefined)).toBe(false);
    expect(isAgent(['agent'])).toBe(false); // exact names only
  });
  test('isAdmin: only admins', () => {
    expect(isAdmin(['Admin', 'Client'])).toBe(true);
    expect(isAdmin(['Agent'])).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe('RequireAgent', () => {
  test('demo build: explains that the backend is needed', () => {
    auth.value = authValue({ enabled: false });
    renderAt(<RequireAgent><Secret /></RequireAgent>);
    expect(screen.getByText(/demo build/)).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  test('while the session loads it shows nothing private', () => {
    auth.value = authValue({ loading: true });
    renderAt(<RequireAgent><Secret /></RequireAgent>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  test('signed out: a sign in link that returns to this page', () => {
    renderAt(<RequireAgent><Secret /></RequireAgent>, { route: '/agent/new' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Fagent%2Fnew');
  });

  test('a buyer is pointed at the application', () => {
    auth.value = authValue({ user: userWith(['Client']) });
    renderAt(<RequireAgent><Secret /></RequireAgent>);
    expect(screen.getByRole('heading', { name: 'Agent access needed' })).toBeInTheDocument();
    expect(screen.getByText(/me@rofo.test has a buyer account/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apply to become an agent' })).toHaveAttribute('href', '/agent/apply');
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  test('agents and admins get through', () => {
    for (const groups of [['Agent'], ['Admin']]) {
      auth.value = authValue({ user: userWith(groups) });
      const { unmount } = renderAt(<RequireAgent><Secret /></RequireAgent>);
      expect(screen.getByText('secret page')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('RequireAdmin', () => {
  test('non admins are refused, even agents', () => {
    auth.value = authValue({ user: userWith(['Agent']) });
    renderAt(<RequireAdmin><Secret /></RequireAdmin>);
    expect(screen.getByRole('heading', { name: 'Admins only' })).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  test('an admin without two step verification sees the lock, not the page', async () => {
    auth.value = authValue({ user: userWith(['Admin']), adminMfa: 'missing' });
    renderAt(<RequireAdmin><Secret /></RequireAdmin>);
    expect(screen.getByRole('heading', { name: 'Turn on two step verification' })).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set it up' })).toHaveAttribute('href', '/account');
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/ }));
    expect(auth.value.recheckAdminMfa).toHaveBeenCalledOnce();
  });

  test('while the check runs, or before it starts, the page stays closed', () => {
    for (const adminMfa of ['unknown', 'na'] as const) {
      auth.value = authValue({ user: userWith(['Admin']), adminMfa });
      const { unmount } = renderAt(<RequireAdmin><Secret /></RequireAdmin>);
      expect(screen.getByText('Checking your account...')).toBeInTheDocument();
      expect(screen.queryByText('secret page')).not.toBeInTheDocument();
      unmount();
    }
  });

  test('an admin with two step verification gets through', () => {
    auth.value = authValue({ user: userWith(['Admin']), adminMfa: 'ok' });
    renderAt(<RequireAdmin><Secret /></RequireAdmin>);
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });

  test('signed out: sign in prompt', () => {
    renderAt(<RequireAdmin><Secret /></RequireAdmin>, { route: '/admin/applications' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Fadmin%2Fapplications');
  });
});
