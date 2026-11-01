import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatSecret, friendlyAuthError, isCode } from '../lib/authFlow';
import { useAuth } from '../state/AuthContext';

type MfaState = 'loading' | 'off' | 'enrolling' | 'on';

/** Your account: who you are, and two step verification with an authenticator app. */
export function Account() {
  const { enabled, user, loading, mfa, adminMfa } = useAuth();
  const [state, setState] = useState<MfaState>('loading');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Find out whether two step verification is already on.
  useEffect(() => {
    if (!enabled || !user) return;
    mfa.isEnabled().then((on) => setState(on ? 'on' : 'off')).catch((e) => { setState('off'); setError(friendlyAuthError(e)); });
  }, [enabled, user, mfa]);

  if (!enabled) return <div className="container detail"><div className="form-card"><h1>Account</h1><p className="muted">Accounts are available once the backend is connected.</p></div></div>;
  if (loading) return <div className="container detail"><p className="muted">Loading...</p></div>;
  if (!user) {
    return <div className="container detail"><div className="form-card"><h1>Account</h1><p className="muted">Sign in to see your account.</p><Link className="btn btn-primary" to="/login?next=/account">Sign in</Link></div></div>;
  }

  /** Start enrolling: get a secret from the server and draw it as a QR code. */
  const begin = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const { secret, uri } = await mfa.begin();
      const QR = await import('qrcode'); // loaded only here, it is not needed anywhere else
      setSetup({ secret, qr: await QR.toDataURL(uri, { margin: 1, width: 220 }) });
      setCode(''); setState('enrolling');
    } catch (e) { setError(friendlyAuthError(e)); } finally { setBusy(false); }
  };

  /** Prove the app works by entering its first code, then switch it on. */
  const finish = async (e: FormEvent) => {
    e.preventDefault();
    if (!isCode(code)) { setError('Enter the 6 digit code shown in your app.'); return; }
    setBusy(true); setError(null);
    try { await mfa.finish(code); setSetup(null); setState('on'); setDone('Two step verification is on. You will be asked for a code each time you sign in.'); }
    catch (err) { setError(friendlyAuthError(err)); } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!window.confirm('Turn off two step verification? Your account will be protected by your password only.')) return;
    setBusy(true); setError(null); setDone(null);
    try { await mfa.disable(); setState('off'); setDone('Two step verification is off.'); }
    catch (err) { setError(friendlyAuthError(err)); } finally { setBusy(false); }
  };

  return (
    <div className="container detail">
      <h1>Your account</h1>

      <section className="form-card wide account-card">
        <h3>Profile</h3>
        <dl className="facts">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Access</dt><dd>{user.groups.length ? user.groups.join(', ') : 'Buyer'}</dd></div>
        </dl>
      </section>

      <section className="form-card wide account-card" aria-labelledby="mfa-title">
        <div className="pool-meta">
          <h3 id="mfa-title">Two step verification</h3>
          {state === 'on' && <span className="chip-status ok">On</span>}
        </div>
        {adminMfa === 'missing' && (
          <div className="notice" role="alert">
            <strong>Admin tools are locked.</strong> Admins must have two step verification on. Turn it on below and they unlock straight away.
          </div>
        )}
        {adminMfa === 'ok' && <p className="muted small">Required for admins, so the admin tools stay unlocked. Turning it off locks them again.</p>}
        <p className="muted">
          Sign in with a code from an authenticator app as well as your password. Recommended for agents and required for admins.
        </p>
        {done && <div className="success" role="status">{done}</div>}
        {error && <div className="notice small" role="alert">{error}</div>}

        {state === 'loading' && <p className="muted">Checking...</p>}
        {state === 'off' && <button className="btn btn-primary" onClick={() => void begin()} disabled={busy}>{busy ? 'Preparing...' : 'Turn on two step verification'}</button>}
        {state === 'on' && <button className="btn btn-ghost" onClick={() => void disable()} disabled={busy}>Turn off</button>}

        {state === 'enrolling' && setup && (
          <form className="mfa-setup" onSubmit={(e) => void finish(e)}>
            <ol className="mfa-steps">
              <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</li>
              <li>Scan this code, or type the key by hand.</li>
              <li>Enter the 6 digit code the app shows.</li>
            </ol>
            <div className="mfa-qr">
              <img src={setup.qr} width={220} height={220} alt="QR code to scan with your authenticator app" />
              <div>
                <span className="muted small">Key for manual entry</span>
                <code className="mfa-secret">{formatSecret(setup.secret)}</code>
              </div>
            </div>
            <div className="notice small" role="note">
              <strong>Keep this key somewhere safe.</strong> If you lose your phone and have no copy, you cannot sign in until an admin resets two step verification for you.
            </div>
            <label className="field">
              <span>Code from the app</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
            </label>
            <div className="row-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setState('off'); setSetup(null); setError(null); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking...' : 'Turn on'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
