import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminGate } from '../lib/authFlow';
import { useAuth } from '../state/AuthContext';

/** True when the user may manage listings. */
export const isAgent = (groups: string[] | undefined): boolean =>
  Boolean(groups?.some((g) => g === 'Agent' || g === 'Admin'));

/** True when the user may review agent applications. */
export const isAdmin = (groups: string[] | undefined): boolean => Boolean(groups?.includes('Admin'));

interface GuardProps {
  children: ReactNode;
  /** Who may pass. */
  allow: (groups: string[]) => boolean;
  signedOutTitle: string;
  /** Shown to signed in users without access. */
  denied: ReactNode;
}

/** Shared gate: demo notice, loading, sign in prompt, no access message, then the page. */
function Guard({ children, allow, signedOutTitle, denied }: GuardProps) {
  const { enabled, user, loading } = useAuth();
  const loc = useLocation();

  if (!enabled) {
    return (
      <div className="container detail">
        <div className="form-card">
          <h1>{signedOutTitle}</h1>
          <p className="muted">This is the demo build. This page works once the backend is connected.</p>
          <Link className="btn btn-primary" to="/">Back home</Link>
        </div>
      </div>
    );
  }
  if (loading) return <div className="container section"><p className="muted">Loading...</p></div>;
  if (!user) {
    return (
      <div className="container detail">
        <div className="form-card">
          <h1>{signedOutTitle}</h1>
          <p className="muted">Sign in or create an account to continue.</p>
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>Sign in</Link>
        </div>
      </div>
    );
  }
  if (!allow(user.groups)) return <div className="container detail"><div className="form-card">{denied}</div></div>;
  return <>{children}</>;
}

/** Agents and admins only. Everyone else is pointed to the application. */
export function RequireAgent({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <Guard
      allow={isAgent}
      signedOutTitle="Sign in to list a property"
      denied={
        <>
          <h1>Agent access needed</h1>
          <p className="muted">{user?.email} has a buyer account. Apply to become an agent and an admin will review it.</p>
          <Link className="btn btn-primary" to="/agent/apply">Apply to become an agent</Link>
        </>
      }
    >
      {children}
    </Guard>
  );
}

/** Admins only, and only with two step verification on. The server enforces the same rule. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, adminMfa, recheckAdminMfa } = useAuth();
  const gate = adminGate(isAdmin(user?.groups), adminMfa);
  return (
    <Guard allow={isAdmin} signedOutTitle="Admin sign in" denied={<><h1>Admins only</h1><p className="muted">You do not have access to this page.</p><Link className="btn btn-ghost" to="/">Back home</Link></>}>
      {gate === 'allow' ? children : gate === 'needs-mfa' ? (
        <div className="container detail">
          <div className="form-card">
            <span className="chip-status bad">Locked</span>
            <h1>Turn on two step verification</h1>
            <p className="muted">Admin tools need two step verification. It protects the payments, applications and agent access that admins control. It takes about a minute with an authenticator app.</p>
            <Link className="btn btn-primary" to="/account">Set it up</Link>
            <button className="btn btn-ghost" onClick={recheckAdminMfa}>I already turned it on, check again</button>
          </div>
        </div>
      ) : <div className="container section"><p className="muted">Checking your account...</p></div>}
    </Guard>
  );
}
