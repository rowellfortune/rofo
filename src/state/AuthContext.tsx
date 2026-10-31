import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiEnabled } from '../api/config';
import { getAuth } from '../api/transport';

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
  signIn: (email: string, password: string) => Promise<'done' | 'confirm'>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  confirm: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
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

  // Restore an existing session on load.
  useEffect(() => {
    if (!apiEnabled) return;
    readUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const signIn = useCallback<AuthApi['signIn']>(async (email, password) => {
    const auth = await getAuth();
    const res = await auth.signIn({ username: email, password });
    if (res.nextStep.signInStep === 'CONFIRM_SIGN_UP') return 'confirm';
    if (!res.isSignedIn) throw new Error('Additional sign-in steps are not supported yet');
    setUser(await readUser());
    return 'done';
  }, []);

  const signUp = useCallback<AuthApi['signUp']>(async (email, password, name) => {
    const auth = await getAuth();
    await auth.signUp({ username: email, password, options: { userAttributes: { email, name } } });
  }, []);

  const confirm = useCallback<AuthApi['confirm']>(async (email, code) => {
    const auth = await getAuth();
    await auth.confirmSignUp({ username: email, confirmationCode: code });
  }, []);

  const signOut = useCallback(async () => {
    const auth = await getAuth();
    await auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ enabled: apiEnabled, user, loading, signIn, signUp, confirm, signOut }),
    [user, loading, signIn, signUp, confirm, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Access auth state and actions. */
export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
