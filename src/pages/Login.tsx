import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';

type Mode = 'signin' | 'signup' | 'confirm';

/** Sign in, sign up and email confirmation in one card. */
export function Login() {
  const { enabled, signIn, signUp, confirm } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  /** Run one auth step and move to the next screen. */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === 'signin') {
        const r = await signIn(email, password);
        if (r === 'confirm') setMode('confirm'); else navigate(next);
      } else if (mode === 'signup') {
        await signUp(email, password, name);
        setMode('confirm');
      } else {
        await confirm(email, code);
        await signIn(email, password);
        navigate(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setBusy(false); }
  };

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Check your email';

  return (
    <div className="container detail">
      <form className="form-card" onSubmit={submit}>
        <h1>{title}</h1>
        {mode === 'confirm' && <p className="muted">We sent a 6 digit code to {email}.</p>}
        {mode === 'signup' && (
          <label>Full name<input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        )}
        {mode !== 'confirm' && (
          <>
            <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            <label>Password
              <input required type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              {mode === 'signup' && <span className="muted small">At least 10 characters with upper case, lower case and a number.</span>}
            </label>
          </>
        )}
        {mode === 'confirm' && (
          <label>Confirmation code<input required inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" /></label>
        )}
        {error && <div className="notice small" role="alert">{error}</div>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Confirm'}
        </button>
        {mode !== 'confirm' && (
          <button type="button" className="btn btn-ghost" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}>
            {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}
