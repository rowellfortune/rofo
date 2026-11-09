import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiMyApplication, apiSubmitApplication } from '../../api/applications';
import { applicationToForm, buildApplication, canReapply, emptyApplication, type ApplicationErrors, type ApplicationForm } from '../../lib/applicationForm';
import { useAuth } from '../../state/AuthContext';
import { isAgent } from '../../components/RequireAgent';
import type { AgentApplication } from '../../types';

/** Apply to become an agent, see the status, and pick up access after approval. */
export function ApplyAgent() {
  const { enabled, user, loading: authLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<AgentApplication | null | undefined>(undefined); // undefined = loading
  const [form, setForm] = useState<ApplicationForm>(() => emptyApplication(user?.name ?? ''));
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The session loads after the first render, so fill the name in once it is known.
  // Never overwrite what the user already typed.
  useEffect(() => {
    if (user?.name) setForm((f) => (f.name ? f : { ...f, name: user.name }));
  }, [user?.name]);

  // Load the user's existing application. Agents already have access, so skip the request.
  useEffect(() => {
    if (!enabled || !user || isAgent(user.groups)) return;
    apiMyApplication()
      .then((a) => { setApp(a); if (a && canReapply(a.status)) setForm(applicationToForm(a)); })
      .catch((e: Error) => { setApp(null); setBanner(e.message); });
  }, [enabled, user]);

  const set = (k: keyof ApplicationForm, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  /** Validate, then send. The server checks everything again. */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = buildApplication(form);
    if (!res.ok) { setErrors(res.errors); setBanner('Fix the highlighted fields.'); return; }
    setBusy(true); setBanner(null);
    try { setApp(await apiSubmitApplication(res.input)); } catch (err) { setBanner((err as Error).message); } finally { setBusy(false); }
  };

  /** After approval the old token has no Agent group yet. Refresh it, then go to the dashboard. */
  const pickUpAccess = async () => {
    setBusy(true); setBanner(null);
    try {
      const fresh = await refresh();
      if (isAgent(fresh?.groups)) navigate('/agent');
      else setBanner('Your access is not active yet. Try again in a minute, or sign out and back in.');
    } catch (err) { setBanner((err as Error).message); } finally { setBusy(false); }
  };

  if (!enabled) {
    return <div className="container detail"><div className="form-card"><h1>Become an agent</h1><p className="muted">Applications open once the backend is connected.</p><Link className="btn btn-primary" to="/">Back home</Link></div></div>;
  }
  if (authLoading) return <div className="container detail"><p className="muted">Loading...</p></div>;
  if (!user) {
    return (
      <div className="container detail"><div className="form-card">
        <h1>Become an agent</h1>
        <p className="muted">Create an account or sign in first, then tell us about your agency.</p>
        <Link className="btn btn-primary" to="/login?next=/agent/apply">Sign in</Link>
      </div></div>
    );
  }
  if (isAgent(user.groups)) {
    return <div className="container detail"><div className="form-card"><h1>You are an agent</h1><p className="muted">You can publish and manage listings.</p><Link className="btn btn-primary" to="/agent">Open dashboard</Link></div></div>;
  }
  if (app === undefined) return <div className="container detail"><p className="muted">Loading your application...</p></div>;

  const field = (label: string, k: keyof ApplicationForm, props: { hint?: string; type?: string; placeholder?: string } = {}) => (
    <label className={`field${errors[k] ? ' has-error' : ''}`}>
      <span>{label}</span>
      <input value={form[k]} onChange={(e) => set(k, e.target.value)} type={props.type ?? 'text'} placeholder={props.placeholder} />
      {props.hint && !errors[k] && <small className="muted">{props.hint}</small>}
      {errors[k] && <small className="field-error" role="alert">{errors[k]}</small>}
    </label>
  );

  // Pending or approved: show status instead of the form.
  if (app && !canReapply(app.status)) {
    return (
      <div className="container detail">
        <div className="form-card status-card">
          {banner && <div className="notice small" role="alert">{banner}</div>}
          {app.status === 'PENDING' ? (
            <>
              <span className="chip-status">In review</span>
              <h1>Application received</h1>
              <p className="muted">Thanks, {app.name.split(' ')[0]}. An admin will review {app.agency}. Come back to this page to see the result.</p>
            </>
          ) : (
            <>
              <span className="chip-status ok">Approved</span>
              <h1>You are approved</h1>
              <p className="muted">Activate your agent access to start listing properties.</p>
              <button className="btn btn-primary btn-lg" onClick={() => void pickUpAccess()} disabled={busy}>{busy ? 'Checking...' : 'Activate agent access'}</button>
            </>
          )}
          <dl className="facts">
            <div><dt>Agency</dt><dd>{app.agency}</dd></div>
            <div><dt>Registration</dt><dd>{app.registrationNo}</dd></div>
            <div><dt>Submitted</dt><dd>{new Date(app.createdAt).toLocaleDateString()}</dd></div>
          </dl>
        </div>
      </div>
    );
  }

  return (
    <div className="container detail">
      <h1>Become an agent</h1>
      <p className="muted lead">Agents can publish listings and receive inquiries. We check each application by hand.</p>
      <form className="editor" onSubmit={(e) => void submit(e)} noValidate>
        {app?.status === 'REJECTED' && (
          <div className="notice" role="status"><strong>Your last application was not approved.</strong> {app.reviewNote} You can fix it and apply again.</div>
        )}
        {app?.status === 'REVOKED' && (
          <div className="notice" role="status"><strong>Your agent access was removed.</strong> {app.reviewNote} You can apply again. An admin will see this history when they review it.</div>
        )}
        {banner && <div className="notice" role="alert">{banner}</div>}
        <section className="form-card wide">
          <h3>About you</h3>
          <div className="grid-2">{field('Full name', 'name')}{field('Phone', 'phone', { type: 'tel' })}</div>
          <h3>Your agency</h3>
          <div className="grid-2">
            {field('Agency or business name', 'agency')}
            {field('Registration or licence number', 'registrationNo', { hint: 'Chamber of Commerce number or agent licence.' })}
            {field('Country', 'country')}
            {field('Website (optional)', 'website', { placeholder: 'https://', hint: 'Helps us verify you.' })}
          </div>
          <label className={`field${errors.about ? ' has-error' : ''}`}>
            <span>Tell us about your work</span>
            <textarea rows={5} value={form.about} onChange={(e) => set('about', e.target.value)} maxLength={1500} />
            <small className="muted">What you sell, where, and for how long. At least 20 characters.</small>
            {errors.about && <small className="field-error" role="alert">{errors.about}</small>}
          </label>
        </section>
        <div className="editor-actions">
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'Sending...' : app && canReapply(app.status) ? 'Apply again' : 'Submit application'}</button>
        </div>
      </form>
    </div>
  );
}
