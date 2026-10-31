import { Link, NavLink } from 'react-router-dom';

/** Logo mark: a house shape in the brand colors. */
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="RoFo estate home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0b1220" />
        <path d="M7 16 16 8l9 8v9H7z" fill="#fff" />
        <rect x="13.5" y="17.5" width="5" height="7.5" rx="1" fill="#2b4fe0" />
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
          <a href="/#sell">Sell</a>
        </nav>
        <div className="header-actions">
          <button className="btn btn-ghost">Log in</button>
          <button className="btn btn-primary">List a property</button>
        </div>
      </div>
    </header>
  );
}
