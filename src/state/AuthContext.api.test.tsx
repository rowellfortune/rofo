import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

// API mode with a fake Amplify Auth module. Each test shapes the fake's answers.
vi.mock('../api/config', () => ({ apiEnabled: true, apiConfig: {} }));
const h = vi.hoisted(() => ({ amp: {} as Record<string, ReturnType<typeof vi.fn>>, payload: null as Record<string, unknown> | null }));
vi.mock('../api/transport', () => ({ getAuth: async () => h.amp }));

const token = (groups: string[] = [], over: Record<string, unknown> = {}) =>
  ({ sub: 'sub-1', email: 'ana@rofo.test', name: 'Ana', 'cognito:groups': groups, ...over });

beforeEach(() => {
  h.payload = null;
  h.amp = {
    fetchAuthSession: vi.fn(async () => ({ tokens: h.payload ? { idToken: { payload: h.payload } } : undefined })),
    signIn: vi.fn(async () => ({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })),
    confirmSignIn: vi.fn(async () => ({ isSignedIn: true })),
    signUp: vi.fn(async () => ({})),
    confirmSignUp: vi.fn(async () => ({})),
    resendSignUpCode: vi.fn(async () => ({})),
    resetPassword: vi.fn(async () => ({})),
    confirmResetPassword: vi.fn(async () => {}),
    fetchMFAPreference: vi.fn(async () => ({ enabled: [] as string[] })),
    setUpTOTP: vi.fn(async () => ({ sharedSecret: 'SECRET', getSetupUri: (app: string, label?: string) => new URL(`otpauth://totp/${encodeURIComponent(app)}:${label}?secret=SECRET`) })),
    verifyTOTPSetup: vi.fn(async () => {}),
    updateMFAPreference: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  };
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
/** Render the hook and wait for the session restore to finish. */
async function mount() {
  const r = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r.result;
}

describe('AuthProvider: session', () => {
  test('restores the user and groups from the ID token', async () => {
    h.payload = token(['Agent']);
    const auth = await mount();
    expect(auth.current.enabled).toBe(true);
    expect(auth.current.user).toEqual({ sub: 'sub-1', email: 'ana@rofo.test', name: 'Ana', groups: ['Agent'] });
  });

  test('a token without a name falls back to the email; no groups is an empty list', async () => {
    h.payload = token(undefined, { name: undefined, 'cognito:groups': undefined });
    const auth = await mount();
    expect(auth.current.user).toMatchObject({ name: 'ana@rofo.test', groups: [] });
  });

  test('guests and failed restores end up signed out', async () => {
    const guest = await mount();
    expect(guest.current.user).toBeNull();
    h.amp.fetchAuthSession.mockRejectedValueOnce(new Error('offline'));
    const failed = await mount();
    expect(failed.current.user).toBeNull();
  });

  test('signOut clears the user', async () => {
    h.payload = token();
    const auth = await mount();
    await act(() => auth.current.signOut());
    expect(h.amp.signOut).toHaveBeenCalled();
    expect(auth.current.user).toBeNull();
  });

  test('refresh forces new tokens and picks up new groups', async () => {
    h.payload = token(['Client']);
    const auth = await mount();
    h.payload = token(['Client', 'Agent']);
    let fresh: unknown;
    await act(async () => { fresh = await auth.current.refresh(); });
    expect(h.amp.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
    expect(fresh).toMatchObject({ groups: ['Client', 'Agent'] });
    expect(auth.current.user?.groups).toEqual(['Client', 'Agent']);
  });
});

describe('AuthProvider: sign in steps', () => {
  test('done: the user is read straight away', async () => {
    const auth = await mount();
    h.payload = token();
    let step: unknown;
    await act(async () => { step = await auth.current.signIn('ana@rofo.test', 'pw'); });
    expect(h.amp.signIn).toHaveBeenCalledWith({ username: 'ana@rofo.test', password: 'pw' });
    expect(step).toBe('done');
    expect(auth.current.user?.email).toBe('ana@rofo.test');
  });

  test('authenticator and unconfirmed steps do not sign in yet', async () => {
    const auth = await mount();
    h.amp.signIn.mockResolvedValueOnce({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' } });
    await expect(auth.current.signIn('a', 'b')).resolves.toBe('totp');
    h.amp.signIn.mockResolvedValueOnce({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' } });
    await expect(auth.current.signIn('a', 'b')).resolves.toBe('confirm');
    expect(auth.current.user).toBeNull();
  });

  test('an unsupported step is an error, not a hang', async () => {
    const auth = await mount();
    h.amp.signIn.mockResolvedValueOnce({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' } });
    await expect(auth.current.signIn('a', 'b')).rejects.toThrow('does not support yet');
  });

  test('codes are sent as digits only', async () => {
    const auth = await mount();
    h.payload = token();
    await act(() => auth.current.confirmTotp('123 456'));
    expect(h.amp.confirmSignIn).toHaveBeenCalledWith({ challengeResponse: '123456' });
    await auth.current.confirm('ana@rofo.test', '65-43-21');
    expect(h.amp.confirmSignUp).toHaveBeenCalledWith({ username: 'ana@rofo.test', confirmationCode: '654321' });
    await auth.current.resetPassword('ana@rofo.test', ' 111 222 ', 'NewPassw0rd!');
    expect(h.amp.confirmResetPassword).toHaveBeenCalledWith({ username: 'ana@rofo.test', confirmationCode: '111222', newPassword: 'NewPassw0rd!' });
  });

  test('a code step that does not finish sign in throws', async () => {
    const auth = await mount();
    h.amp.confirmSignIn.mockResolvedValueOnce({ isSignedIn: false });
    await expect(auth.current.confirmTotp('123456')).rejects.toThrow('Sign in did not finish');
  });

  test('sign up sends email and name as attributes; resend and forgot pass the email', async () => {
    const auth = await mount();
    await auth.current.signUp('ana@rofo.test', 'pw', 'Ana');
    expect(h.amp.signUp).toHaveBeenCalledWith({ username: 'ana@rofo.test', password: 'pw', options: { userAttributes: { email: 'ana@rofo.test', name: 'Ana' } } });
    await auth.current.resendCode('ana@rofo.test');
    expect(h.amp.resendSignUpCode).toHaveBeenCalledWith({ username: 'ana@rofo.test' });
    await auth.current.forgotPassword('ana@rofo.test');
    expect(h.amp.resetPassword).toHaveBeenCalledWith({ username: 'ana@rofo.test' });
  });
});

describe('AuthProvider: two step verification', () => {
  test('isEnabled reads the TOTP preference', async () => {
    const auth = await mount();
    await expect(auth.current.mfa.isEnabled()).resolves.toBe(false);
    h.amp.fetchMFAPreference.mockResolvedValueOnce({ enabled: ['TOTP'] });
    await expect(auth.current.mfa.isEnabled()).resolves.toBe(true);
  });

  test('begin labels the QR with the email, not the internal id', async () => {
    h.payload = token();
    const auth = await mount();
    const setup = await auth.current.mfa.begin();
    expect(setup.secret).toBe('SECRET');
    expect(setup.uri).toContain('ana@rofo.test');
    expect(setup.uri).not.toContain('sub-1');
  });

  test('finish verifies the code and makes TOTP the preferred step', async () => {
    const auth = await mount();
    await act(() => auth.current.mfa.finish('123 456'));
    expect(h.amp.verifyTOTPSetup).toHaveBeenCalledWith({ code: '123456' });
    expect(h.amp.updateMFAPreference).toHaveBeenCalledWith({ totp: 'PREFERRED' });
    expect(auth.current.adminMfa).toBe('na'); // not an admin, so nothing to unlock
  });

  test('admins: locked without MFA, unlocked by finish, locked again by disable', async () => {
    h.payload = token(['Admin']);
    const auth = await mount();
    await waitFor(() => expect(auth.current.adminMfa).toBe('missing'));
    await act(() => auth.current.mfa.finish('123456'));
    expect(auth.current.adminMfa).toBe('ok');
    await act(() => auth.current.mfa.disable());
    expect(h.amp.updateMFAPreference).toHaveBeenLastCalledWith({ totp: 'DISABLED' });
    expect(auth.current.adminMfa).toBe('missing');
  });

  test('admins with MFA are ok; a failed check locks, and recheck asks again', async () => {
    h.payload = token(['Admin']);
    h.amp.fetchMFAPreference.mockRejectedValueOnce(new Error('offline'));
    const auth = await mount();
    await waitFor(() => expect(auth.current.adminMfa).toBe('missing'));
    h.amp.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP'] });
    act(() => auth.current.recheckAdminMfa());
    await waitFor(() => expect(auth.current.adminMfa).toBe('ok'));
  });

  test('non-admins are never checked', async () => {
    h.payload = token(['Agent']);
    const auth = await mount();
    expect(auth.current.adminMfa).toBe('na');
    expect(h.amp.fetchMFAPreference).not.toHaveBeenCalled();
  });
});
