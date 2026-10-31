import { Logo } from './Header';

/** Site footer with link columns. */
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p className="muted">Homes for sale and rent across the Caribbean.</p>
        </div>
        <div>
          <h4>Search</h4>
          <a href="/search?deal=buy">Homes for sale</a>
          <a href="/search?deal=rent">Homes for rent</a>
          <a href="/search?type=Land">Land</a>
        </div>
        <div>
          <h4>For agents</h4>
          <a href="/agent/apply">Become an agent</a>
          <a href="#plans">Plans</a>
        </div>
        <div>
          <h4>Company</h4>
          <a href="#about">About RoFo</a>
          <a href="#contact">Contact</a>
          <a href="#privacy">Privacy</a>
        </div>
      </div>
      <div className="container footer-bottom">© {new Date().getFullYear()} RoFo estate. Demo with sample data.</div>
    </footer>
  );
}
