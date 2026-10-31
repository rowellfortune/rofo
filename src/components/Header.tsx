import { Link, NavLink } from 'react-router-dom';

/** Logo mark: a house shape in the brand colors. */
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="RoFo estate home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0b3d4a" />
        <path d="M6 16 16 7l10 9v9H6z" fill="#ff7a45" />
        <rect x="13" y="17" width="6" height="8" fill="#0b3d4a" />
      </svg>
      <span>RoFo<em>estate</em></span>
    </Link>
  );
}

/** Top navigation bar shown on every page. */
export function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Logo />
        <nav className="nav" aria-label="Main">
          <NavLink to="/search?deal=buy">Buy</NavLink>
          <NavLink to="/search?deal=rent">Rent</NavLink>
          <NavLink to="/pools">Buy together</NavLink>
          <a href="#sell">Sell</a>
          <a href="#agents">Find an agent</a>
        </nav>
        <div className="header-actions">
          <button className="btn btn-ghost">Saved</button>
          <button className="btn btn-primary">Log in</button>
        </div>
      </div>
    </header>
  );
}
