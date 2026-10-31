import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';

/** True when the user may manage listings. */
export const isAgent = (groups: string[] | undefined): boolean =>
  Boolean(groups?.some((g) => g === 'Agent' || g === 'Admin'));

/** Only lets agents and admins through. Everyone else sees why. */
export function RequireAgent({ children }: { children: ReactNode }) {
  const { enabled, user, loading } = useAuth();
  const loc = useLocation();

  if (!enabled) {
    return (
      <div className="container detail">
        <div className="form-card">
          <h1>Agent dashboard</h1>
          <p className="muted">This is the demo build. The dashboard works once the backend is connected.</p>
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
          <h1>Sign in to list a property</h1>
          <p className="muted">Create an account or sign in, then ask us to enable agent access.</p>
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>Sign in</Link>
        </div>
      </div>
    );
  }
  if (!isAgent(user.groups)) {
    return (
      <div className="container detail">
        <div className="form-card">
          <h1>Agent access needed</h1>
          <p className="muted">
            {user.email} has a buyer account. Agent access is approved by an admin, so you can publish listings.
            If you just got approved, sign out and back in to refresh your access.
          </p>
          <Link className="btn btn-ghost" to="/">Back home</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
