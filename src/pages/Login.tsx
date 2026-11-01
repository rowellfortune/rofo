import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { checkPassword, friendlyAuthError, isCode, isExpiredSession, RESEND_SECONDS } from '../lib/authFlow';
import { useAuth } from '../state/AuthContext';

/** The steps of the sign in flow. */
type Mode = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset' | 'totp';

const TITLES: Record<Mode, string> = {
  signin: 'Sign in',
  signup: 'Create your account',
  confirm: 'Check your email',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
  totp: 'Two step verification',
};

/** Sign in, sign up, email confirmation, password reset and the authenticator code step. */
export function Login() {
  const { enabled, user, signIn, confirmTotp, signUp, confirm, resendCode, forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds until another emailed code may be requested

  // Already signed in: nothing to do here.
  useEffect(() => { if (user) navigate(next, { replace: true }); }, [user, next, navigate]);

  // Count the resend cooldown down once a second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!enabled) {
    return (
      <div className="container detail">
        <div className="form-card">
          <h1>Sign in</h1>
          <p className="muted">This is the demo build. Accounts are available once the backend is connected.</p>
          <Link className="btn btn-primary" to="/">Back home</Link>
        </div>
      </div>
    );
  }

  /** Move to another step and clear the messages. */
  const go = (m: Mode, message: string | null = null) => { setMode(m); setError(null); setInfo(message); setCode(''); };

  /** Where a successful sign in leads. */
  const afterSignIn = (r: 'done' | 'confirm' | 'totp') => {
    if (r === 'done') navigate(next, { replace: true });
    else if (r === 'totp') go('totp', 'Open your authenticator app and enter the 6 digit code.');
    else go('confirm', `Confirm your email first. Enter the code we sent to ${email}, or ask for a new one.`);
  };

  /** Run one step. Errors become plain sentences. A timed out sign in goes back to the start. */
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); }
    catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'UserNotConfirmedException') go('confirm', 'Confirm your email first. Enter the code we sent, or ask for a new one.');
      else if (isExpiredSession(err) && mode === 'totp') { go('signin'); setError(friendlyAuthError(err)); }
      else setError(friendlyAuthError(err));
    } finally { setBusy(false); }
  };

  /** Ask for another emailed code, with a cooldown so it cannot be hammered. */
  const resend = async (kind: 'confirm' | 'reset') => {
    if (cooldown > 0 || busy) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      if (kind === 'confirm') await resendCode(email); else await forgotPassword(email);
      setInfo('We sent a new code. It can take a minute to arrive. Check spam too.');
      setCooldown(RESEND_SECONDS);
    } catch (err) { setError(friendlyAuthError(err)); } finally { setBusy(false); }
  };

  const submitSignin = run(async () => afterSignIn(await signIn(email.trim(), password)));
  const submitSignup = run(async () => {
    const weak = checkPassword(password);
    if (weak) { setError(weak); return; }
    await signUp(email.trim(), password, name.trim());
    go('confirm', `We sent a 6 digit code to ${email.trim()}.`);
  });
  const submitConfirm = run(async () => {
    if (!isCode(code)) { setError('Enter the 6 digit code.'); return; }
    await confirm(email.trim(), code);
    if (password) afterSignIn(await signIn(email.trim(), password)); else go('signin', 'Email confirmed. Sign in to continue.');
  });
  const submitForgot = run(async () => {
    await forgotPassword(email.trim());
    // The same message whether or not an account exists, so this form cannot be used to look up emails.
    go('reset', `If an account exists for ${email.trim()}, we sent a code. It can take a minute to arrive.`);
    setCooldown(RESEND_SECONDS);
  });
  const submitReset = run(async () => {
    if (!isCode(code)) { setError('Enter the 6 digit code from the email.'); return; }
    const weak = checkPassword(password);
    if (weak) { setError(weak); return; }
    await resetPassword(email.trim(), code, password);
    setPassword('');
    go('signin', 'Password updated. Sign in with your new password.');
  });
  const submitTotp = run(async () => {
    if (!isCode(code)) { setError('Enter the 6 digit code from your app.'); return; }
    await confirmTotp(code);
    navigate(next, { replace: true });
  });

  const submit = { signin: submitSignin, signup: submitSignup, confirm: submitConfirm, forgot: submitForgot, reset: submitReset, totp: submitTotp }[mode];
  const button = { signin: 'Sign in', signup: 'Create account', confirm: 'Confirm', forgot: 'Send reset code', reset: 'Update password', totp: 'Verify' }[mode];

  const emailField = (
    <label className="field">
      <span>Email</span>
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
    </label>
  );
  const codeField = (label: string) => (
    <label className="field">
      <span>{label}</span>
      <input required inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="123456" autoFocus />
    </label>
  );
  const passwordField = (label: string, current: boolean) => (
    <label className="field">
      <span>{label}</span>
      <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={current ? 'current-password' : 'new-password'} />
      {!current && <small className="muted">At least 10 characters with upper case, lower case and a number.</small>}
    </label>
  );
  const resendButton = (kind: 'confirm' | 'reset') => (
    <button type="button" className="btn btn-ghost" disabled={cooldown > 0 || busy} onClick={() => void resend(kind)}>
      {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
    </button>
  );

  return (
    <div className="container detail">
      <form className="form-card" onSubmit={(e) => void submit(e)} noValidate={false}>
        <h1>{TITLES[mode]}</h1>
        {info && <div className="success" role="status">{info}</div>}
        {error && <div className="notice small" role="alert">{error}</div>}

        {mode === 'signup' && (
          <label className="field"><span>Full name</span><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        )}
        {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && emailField}
        {(mode === 'signin' || mode === 'signup') && passwordField('Password', mode === 'signin')}
        {mode === 'confirm' && <>{codeField('Confirmation code')}{resendButton('confirm')}</>}
        {mode === 'reset' && <>{codeField('Code from the email')}{passwordField('New password', false)}{resendButton('reset')}</>}
        {mode === 'totp' && codeField('Authenticator code')}

        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'Please wait...' : button}</button>

        {mode === 'signin' && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => go('forgot')}>Forgot your password?</button>
            <button type="button" className="btn btn-ghost" onClick={() => go('signup')}>New here? Create an account</button>
          </>
        )}
        {mode === 'signup' && <button type="button" className="btn btn-ghost" onClick={() => go('signin')}>Have an account? Sign in</button>}
        {(mode === 'forgot' || mode === 'reset' || mode === 'confirm' || mode === 'totp') && (
          <button type="button" className="btn btn-ghost" onClick={() => { setPassword(''); go('signin'); }}>Back to sign in</button>
        )}
      </form>
    </div>
  );
}
