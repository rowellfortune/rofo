import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, userWith } from '../test/mocks';
import { currentUrl, renderAt } from '../test/utils';
import { Login } from './Login';

const auth = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').authValue> }));
vi.mock('../state/AuthContext', () => ({ useAuth: () => auth.value }));
beforeEach(() => { auth.value = authValue(); });

const GOOD = 'Str0ngPassw0rd';
// Labels can carry a hint after the name (the password rules), so match on the start.
const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}`), { selector: 'input' });
const err = (name: string, message = '') => Object.assign(new Error(message), { name });
// Mounted on /login only, like the app, so navigating away unmounts the page.
const open = (route = '/login') => renderAt(<Login />, { route, path: '/login' });

describe('Login: sign in', () => {
  test('demo build: explains accounts need the backend', () => {
    auth.value = authValue({ enabled: false });
    open();
    expect(screen.getByText(/This is the demo build/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  test('already signed in: goes straight to next', async () => {
    auth.value = authValue({ user: userWith() });
    open('/login?next=/pools');
    await waitFor(() => expect(currentUrl()).toBe('/pools'));
  });

  test('success goes to next, email is trimmed', async () => {
    const user = userEvent.setup();
    open('/login?next=/account');
    await user.type(field('Email'), '  me@rofo.test ');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.value.signIn).toHaveBeenCalledWith('me@rofo.test', GOOD);
    await waitFor(() => expect(currentUrl()).toBe('/account'));
  });

  test('wrong password: a plain, vague message', async () => {
    const user = userEvent.setup();
    auth.value = authValue({ signIn: vi.fn(async () => { throw err('NotAuthorizedException', 'Incorrect username or password.'); }) });
    open();
    await user.type(field('Email'), 'me@rofo.test');
    await user.type(field('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  test('unconfirmed account: moves to the code step', async () => {
    const user = userEvent.setup();
    auth.value = authValue({ signIn: vi.fn(async () => 'confirm' as const) });
    open();
    await user.type(field('Email'), 'me@rofo.test');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('me@rofo.test');
  });

  test('UserNotConfirmedException thrown also lands on the code step', async () => {
    const user = userEvent.setup();
    auth.value = authValue({ signIn: vi.fn(async () => { throw err('UserNotConfirmedException'); }) });
    open();
    await user.type(field('Email'), 'me@rofo.test');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('Confirmation code', { selector: 'input' })).toBeInTheDocument();
  });
});

describe('Login: authenticator step', () => {
  const toTotp = async (user: ReturnType<typeof userEvent.setup>) => {
    auth.value.signIn = vi.fn(async () => 'totp' as const);
    await user.type(field('Email'), 'me@rofo.test');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Two step verification' });
  };

  test('a valid code finishes sign in', async () => {
    const user = userEvent.setup();
    open('/login?next=/agent');
    await toTotp(user);
    await user.type(field('Authenticator code'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(auth.value.confirmTotp).toHaveBeenCalledWith('123 456');
    await waitFor(() => expect(currentUrl()).toBe('/agent'));
  });

  test('a short code is caught before calling the server', async () => {
    const user = userEvent.setup();
    open();
    await toTotp(user);
    await user.type(field('Authenticator code'), '12345');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6 digit code from your app.');
    expect(auth.value.confirmTotp).not.toHaveBeenCalled();
  });

  test('an expired sign in session goes back to the password step', async () => {
    const user = userEvent.setup();
    open();
    await toTotp(user);
    auth.value.confirmTotp = vi.fn(async () => { throw err('NotAuthorizedException', 'Invalid session for the user, session is expired.'); });
    await user.type(field('Authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('That sign in took too long. Start again.');
  });
});

describe('Login: sign up and confirm', () => {
  test('weak password is refused locally', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    await user.type(field('Full name'), 'Ana');
    await user.type(field('Email'), 'ana@rofo.test');
    await user.type(field('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters.');
    expect(auth.value.signUp).not.toHaveBeenCalled();
  });

  test('sign up, confirm, then signed in automatically with the same password', async () => {
    const user = userEvent.setup();
    open('/login?next=/pools');
    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    await user.type(field('Full name'), ' Ana ');
    await user.type(field('Email'), 'ana@rofo.test');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(auth.value.signUp).toHaveBeenCalledWith('ana@rofo.test', GOOD, 'Ana');
    expect(await screen.findByRole('status')).toHaveTextContent('We sent a 6 digit code to ana@rofo.test.');

    await user.type(field('Confirmation code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(auth.value.confirm).toHaveBeenCalledWith('ana@rofo.test', '654321');
    expect(auth.value.signIn).toHaveBeenCalledWith('ana@rofo.test', GOOD);
    await waitFor(() => expect(currentUrl()).toBe('/pools'));
  });

  test('existing email: says so in plain words', async () => {
    const user = userEvent.setup();
    auth.value = authValue({ signUp: vi.fn(async () => { throw err('UsernameExistsException'); }) });
    open();
    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    await user.type(field('Full name'), 'Ana');
    await user.type(field('Email'), 'ana@rofo.test');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists');
  });
});

describe('Login: resend cooldown', () => {
  afterEach(() => { vi.useRealTimers(); });

  test('resend is locked for 30 seconds, then available again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    auth.value = authValue({ signIn: vi.fn(async () => 'confirm' as const) });
    open();
    await user.type(field('Email'), 'me@rofo.test');
    await user.type(field('Password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(auth.value.resendCode).toHaveBeenCalledWith('me@rofo.test');
    expect(await screen.findByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled();
    // Each tick schedules the next one after a render, so step one second at a time.
    for (let i = 0; i < 31; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });
});

describe('Login: forgot password', () => {
  const toReset = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    await user.type(field('Email'), 'ghost@rofo.test');
    await user.click(screen.getByRole('button', { name: 'Send reset code' }));
    await screen.findByRole('heading', { name: 'Choose a new password' });
  };

  test('the same neutral message whether or not the account exists', async () => {
    const user = userEvent.setup();
    open();
    await toReset(user);
    expect(auth.value.forgotPassword).toHaveBeenCalledWith('ghost@rofo.test');
    expect(screen.getByRole('status')).toHaveTextContent('If an account exists for ghost@rofo.test, we sent a code.');
    expect(screen.getByRole('button', { name: /Send a new code in/ })).toBeDisabled();
  });

  test('reset checks code and password, then returns to sign in', async () => {
    const user = userEvent.setup();
    open();
    await toReset(user);
    await user.type(field('Code from the email'), '12');
    await user.type(field('New password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6 digit code from the email.');

    await user.clear(field('Code from the email'));
    await user.type(field('Code from the email'), '111222');
    await user.clear(field('New password'));
    await user.type(field('New password'), 'weakpassword');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add an upper case letter.');
    expect(auth.value.resetPassword).not.toHaveBeenCalled();

    await user.clear(field('New password'));
    await user.type(field('New password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(auth.value.resetPassword).toHaveBeenCalledWith('ghost@rofo.test', '111222', GOOD);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Password updated. Sign in with your new password.');
    expect(field('Password')).toHaveValue(''); // the new password is not left in the form
  });

  test('Back to sign in clears the step', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
