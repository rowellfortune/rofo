import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, userWith } from '../test/mocks';
import { renderAt } from '../test/utils';
import { Account } from './Account';

const auth = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').authValue> }));
vi.mock('../state/AuthContext', () => ({ useAuth: () => auth.value }));
// The QR library draws on a canvas, which jsdom lacks. A fixed data URL is enough here.
vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,QR') }));
beforeEach(() => { auth.value = authValue({ user: userWith(['Agent']) }); });

const open = () => renderAt(<Account />, { route: '/account' });

describe('Account', () => {
  test('demo build, loading and signed out states', () => {
    auth.value = authValue({ enabled: false });
    const a = open();
    expect(screen.getByText(/once the backend is connected/)).toBeInTheDocument();
    a.unmount();
    auth.value = authValue({ loading: true });
    const b = open();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    b.unmount();
    auth.value = authValue();
    open();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=/account');
  });

  test('profile shows name, email and groups (Buyer when none)', () => {
    open();
    expect(screen.getByText('Me Myself')).toBeInTheDocument();
    expect(screen.getByText('me@rofo.test')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  test('enrol: QR plus grouped key, then a code turns it on', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Turn on two step verification' }));
    expect(await screen.findByRole('img', { name: /QR code/ })).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(document.querySelector('.mfa-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');

    await user.type(screen.getByLabelText('Code from the app'), '12');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6 digit code shown in your app.');
    expect(auth.value.mfa.finish).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Code from the app'));
    await user.type(screen.getByLabelText('Code from the app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(auth.value.mfa.finish).toHaveBeenCalledWith('123456');
    expect(await screen.findByRole('status')).toHaveTextContent('Two step verification is on.');
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  test('Cancel leaves it off', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Turn on two step verification' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Turn on two step verification' })).toBeInTheDocument();
  });

  test('a wrong code shows a plain message', async () => {
    const user = userEvent.setup();
    auth.value.mfa.finish = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'EnableSoftwareTokenMFAException' }); });
    open();
    await user.click(await screen.findByRole('button', { name: 'Turn on two step verification' }));
    await user.type(await screen.findByLabelText('Code from the app'), '000000');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
  });

  test('turning off asks first; saying no keeps it on', async () => {
    const user = userEvent.setup();
    auth.value.mfa.isEnabled = vi.fn(async () => true);
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    open();
    await user.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(ask).toHaveBeenCalledOnce();
    expect(auth.value.mfa.disable).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(auth.value.mfa.disable).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Two step verification is off.');
  });

  test('admin without MFA sees the locked banner; with MFA, a note', async () => {
    auth.value = authValue({ user: userWith(['Admin']), adminMfa: 'missing' });
    const a = open();
    expect(screen.getByRole('alert')).toHaveTextContent('Admin tools are locked.');
    a.unmount();
    auth.value = authValue({ user: userWith(['Admin']), adminMfa: 'ok' });
    open();
    expect(screen.getByText(/Required for admins/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Checking...')).not.toBeInTheDocument());
  });

  test('a failed status check falls back to off and shows the error', async () => {
    auth.value.mfa.isEnabled = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'NetworkError' }); });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.getByRole('button', { name: 'Turn on two step verification' })).toBeInTheDocument();
  });
});
