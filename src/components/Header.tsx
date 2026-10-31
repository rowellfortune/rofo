import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { isAgent } from './RequireAgent';

/** Logo mark: a house shape in the brand colors. */
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="RoFo estate home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#e8ebf2" />
        <path d="M7 16 16 8l9 8v9H7z" fill="#0b0d12" />
        <rect x="13.5" y="17.5" width="5" height="7.5" rx="1" fill="#4c68f5" />
      </svg>
      <span>RoFo<em>estate</em></span>
    </Link>
  );
}

/** Top navigation bar shown on every page. */
export function Header() {
  const { user, signOut } = useAuth();
  const loc = useLocation();
  // Buy and Rent share the /search path, so mark them active by their deal param.
  const deal = loc.pathname === '/search' ? new URLSearchParams(loc.search).get('deal') : null;
  const dealLink = (d: 'buy' | 'rent', label: string) => (
    <Link to={`/search?deal=${d}`} className={deal === d ? 'active' : undefined}>{label}</Link>
  );
  return (
    <header className="header">
      <div className="container header-inner">
        <Logo />
        <nav className="nav" aria-label="Main">
          {dealLink('buy', 'Buy')}
          {dealLink('rent', 'Rent')}
          <NavLink to="/pools">Buy together</NavLink>
          <a href="/#sell">Sell</a>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <span className="muted small header-user">{user.email}</span>
              <button className="btn btn-ghost" onClick={() => void signOut()}>Sign out</button>
            </>
          ) : (
            <Link className="btn btn-ghost" to="/login">Log in</Link>
          )}
          <Link className="btn btn-primary" to={isAgent(user?.groups) ? '/agent' : '/agent/new'}>{isAgent(user?.groups) ? 'Dashboard' : 'List a property'}</Link>
        </div>
      </div>
    </header>
  );
}
