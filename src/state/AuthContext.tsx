import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiEnabled } from '../api/config';
import { getAuth } from '../api/transport';
import { nextAfterSignIn, normalizeCode as normalizeCodeForApi, type AdminMfa } from '../lib/authFlow';

/** The signed-in user, read from the Cognito ID token. */
export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  groups: string[];
}

interface AuthApi {
  /** False in demo mode. Sign in is unavailable then. */
  enabled: boolean;
  user: AuthUser | null;
  loading: boolean;
  /** 'done' = signed in. 'confirm' = email not confirmed yet. 'totp' = enter the authenticator app code next. */
  signIn: (email: string, password: string) => Promise<'done' | 'confirm' | 'totp'>;
  /** Finish a sign in that asked for an authenticator code. */
  confirmTotp: (code: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  confirm: (email: string, code: string) => Promise<void>;
  /** Email a new confirmation code. */
  resendCode: (email: string) => Promise<void>;
  /** Email a password reset code. Works the same whether or not the account exists. */
  forgotPassword: (email: string) => Promise<void>;
  /** Set a new password with the emailed code. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  /** Two step sign in with an authenticator app. */
  mfa: {
    isEnabled: () => Promise<boolean>;
    /** Start enrolling. Returns the secret and the otpauth link to show as a QR code. */
    begin: () => Promise<{ secret: string; uri: string }>;
    /** Prove the app works by entering its first code. Turns MFA on. */
    finish: (code: string) => Promise<void>;
    disable: () => Promise<void>;
  };
  signOut: () => Promise<void>;
  /** Admins only: is two step verification on? Admin tools stay locked until it is. */
  adminMfa: AdminMfa;
  /** Ask again, for example right after turning it on in another tab. */
  recheckAdminMfa: () => void;
  /** Re-read groups from Cognito without signing out (use after an admin approves you). */
  refresh: () => Promise<AuthUser | null>;
}

const Ctx = createContext<AuthApi | null>(null);

/** Read the user from the current Cognito session, or null for guests. */
async function readUser(): Promise<AuthUser | null> {
  const auth = await getAuth();
  const session = await auth.fetchAuthSession();
  const p = session.tokens?.idToken?.payload;
  if (!p) return null;
  const groups = p['cognito:groups'];
  return {
    sub: String(p.sub),
    email: String(p.email ?? ''),
    name: String(p.name ?? p.email ?? ''),
    groups: Array.isArray(groups) ? groups.map(String) : [],
  };
}

/** Holds the Cognito session for the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(apiEnabled);
  const [adminMfa, setAdminMfa] = useState<AdminMfa>('na');
  const [recheck, setRecheck] = useState(0); // bump to ask again

  // Restore an existing session on load.
  useEffect(() => {
    if (!apiEnabled) return;
    readUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const signIn = useCallback<AuthApi['signIn']>(async (email, password) => {
    const auth = await getAuth();
    const res = await auth.signIn({ username: email, password });
    const next = nextAfterSignIn(res.nextStep?.signInStep, res.isSignedIn);
    if (next === 'unsupported') throw new Error('This account needs a sign in step the app does not support yet. Contact an admin.');
    if (next === 'done') setUser(await readUser());
    return next;
  }, []);

  const confirmTotp = useCallback<AuthApi['confirmTotp']>(async (code) => {
    const auth = await getAuth();
    const res = await auth.confirmSignIn({ challengeResponse: normalizeCodeForApi(code) });
    if (!res.isSignedIn) throw new Error('Sign in did not finish. Start again.');
    setUser(await readUser());
  }, []);

  const resendCode = useCallback<AuthApi['resendCode']>(async (email) => {
    const auth = await getAuth();
    await auth.resendSignUpCode({ username: email });
  }, []);

  const forgotPassword = useCallback<AuthApi['forgotPassword']>(async (email) => {
    const auth = await getAuth();
    await auth.resetPassword({ username: email });
  }, []);

  const resetPassword = useCallback<AuthApi['resetPassword']>(async (email, code, newPassword) => {
    const auth = await getAuth();
    await auth.confirmResetPassword({ username: email, confirmationCode: normalizeCodeForApi(code), newPassword });
  }, []);

  const mfa = useMemo<AuthApi['mfa']>(() => ({
    isEnabled: async () => {
      const auth = await getAuth();
      const pref = await auth.fetchMFAPreference();
      return Boolean(pref.enabled?.includes('TOTP'));
    },
    begin: async () => {
      const auth = await getAuth();
      const setup = await auth.setUpTOTP();
      // The authenticator lists the app name and an account label. Use the email, not the internal user id,
      // so a person with several accounts can tell them apart.
      const who = await readUser();
      return { secret: setup.sharedSecret, uri: setup.getSetupUri('RoFo estate', who?.email || undefined).toString() };
    },
    finish: async (code) => {
      const auth = await getAuth();
      await auth.verifyTOTPSetup({ code: normalizeCodeForApi(code) });
      await auth.updateMFAPreference({ totp: 'PREFERRED' }); // make it the sign in step from now on
      setAdminMfa((prev) => (prev === 'na' ? 'na' : 'ok')); // an admin just unlocked the admin tools
    },
    disable: async () => {
      const auth = await getAuth();
      await auth.updateMFAPreference({ totp: 'DISABLED' });
      setAdminMfa((prev) => (prev === 'na' ? 'na' : 'missing')); // and an admin just locked them again
    },
  }), []);

  // Admins: find out whether two step verification is on. The server checks too, this is for the screens.
  const isAdminUser = Boolean(user?.groups.includes('Admin'));
  useEffect(() => {
    if (!apiEnabled || !user || !isAdminUser) { setAdminMfa('na'); return; }
    let stale = false;
    setAdminMfa('unknown');
    // If the check fails we lock, like the server does. "Check again" retries.
    mfa.isEnabled().then((on) => { if (!stale) setAdminMfa(on ? 'ok' : 'missing'); }).catch(() => { if (!stale) setAdminMfa('missing'); });
    return () => { stale = true; };
  }, [user?.sub, isAdminUser, mfa, recheck]);
  const recheckAdminMfa = useCallback(() => setRecheck((n) => n + 1), []);

  const signUp = useCallback<AuthApi['signUp']>(async (email, password, name) => {
    const auth = await getAuth();
    await auth.signUp({ username: email, password, options: { userAttributes: { email, name } } });
  }, []);

  const confirm = useCallback<AuthApi['confirm']>(async (email, code) => {
    const auth = await getAuth();
    await auth.confirmSignUp({ username: email, confirmationCode: normalizeCodeForApi(code) });
  }, []);

  const signOut = useCallback(async () => {
    const auth = await getAuth();
    await auth.signOut();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const auth = await getAuth();
    await auth.fetchAuthSession({ forceRefresh: true }); // new tokens carry the current groups
    const fresh = await readUser();
    setUser(fresh);
    return fresh;
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ enabled: apiEnabled, user, loading, signIn, confirmTotp, signUp, confirm, resendCode, forgotPassword, resetPassword, mfa, signOut, adminMfa, recheckAdminMfa, refresh }),
    [user, loading, signIn, confirmTotp, signUp, confirm, resendCode, forgotPassword, resetPassword, mfa, signOut, adminMfa, recheckAdminMfa, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Access auth state and actions. */
export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
