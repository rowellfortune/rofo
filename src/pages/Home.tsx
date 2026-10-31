import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { ListingCard } from '../components/ListingCard';
import { PoolCard } from '../components/PoolCard';
import { popularPlaces } from '../data/listings';
import { useSearch } from '../hooks/useListings';
import { placeholderImage } from '../lib/format';
import { usePools } from '../state/PoolsContext';

/** Line icons for the feature cards. */
const icons: Record<string, ReactNode> = {
  map: <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  users: <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19m16 0v-1.5a3.5 3.5 0 0 0-2.6-3.4M14.5 4.2a3.5 3.5 0 0 1 0 6.6M10 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
  building: <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21M3 21h18M8 8h2m-2 4h2m-2 4h2" />,
};

/** Small stroked icon in a soft tile. */
function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <span className="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icons[name]}
      </svg>
    </span>
  );
}

/** Landing page: hero with product preview, stats, features, listings, CTA. */
export function Home() {
  const { pools } = usePools();
  const { data: listings } = useSearch(new URLSearchParams());
  const fresh = listings.filter((l) => l.isNew || l.openHouse).slice(0, 4);
  const recent = listings.slice(0, 8);
  const countries = new Set(listings.map((l) => l.country)).size;
  const previewListing = listings[0];
  const previewPool = pools[0];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <Link to="/pools" className="eyebrow"><b>New</b> Buy a home together with a group →</Link>
            <h1>Find, rent and buy property across the Caribbean</h1>
            <p className="hero-sub">
              Search listings on a map, compare homes side by side, or pool with others to buy.
            </p>
            <SearchBar />
            <div className="hero-stats">
              <div><strong>{listings.length}</strong><span>Active listings</span></div>
              <div><strong>{countries}</strong><span>Countries</span></div>
              <div><strong>{pools.length}</strong><span>Open buying pools</span></div>
            </div>
          </div>
          <div className="hero-preview" aria-hidden="true">
            {previewListing && <ListingCard listing={previewListing} />}
            {previewPool && <div className="pool-mini"><PoolCard pool={previewPool} /></div>}
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-title">
          <h2>Everything you need to find the right place</h2>
          <p>One platform for buyers, renters, groups and agents.</p>
        </div>
        <div className="features">
          <div className="feature">
            <Icon name="map" />
            <h3>Search on the map</h3>
            <p>Filter by price, type and bedrooms. See every result on a live map and open a listing in one click.</p>
            <Link to="/search">Browse listings →</Link>
          </div>
          <div className="feature">
            <Icon name="users" />
            <h3>Buy together</h3>
            <p>Form a group, set monthly contributions and track ownership shares, votes and payments in one place.</p>
            <Link to="/pools">See buying pools →</Link>
          </div>
          <div className="feature" id="agents">
            <Icon name="building" />
            <h3>List as an agent</h3>
            <p>Publish properties, receive inquiries and manage your portfolio from a single dashboard.</p>
            <Link to="/agent/apply">Become an agent →</Link>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>New and open this weekend</h2>
          <Link to="/search">View all</Link>
        </div>
        <div className="grid">{fresh.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
      </section>

      <section className="container section">
        <div className="section-head"><h2>Popular places</h2></div>
        <div className="places">
          {popularPlaces.map((p) => (
            <Link key={p.city} to={`/search?q=${encodeURIComponent(p.city)}`} className="place">
              <div className="place-img" style={{ backgroundImage: `url("${placeholderImage(p.hue, 1)}")` }} />
              <div className="place-label"><strong>{p.city}</strong><span>{p.country}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Recently added</h2>
          <Link to="/search">View all</Link>
        </div>
        <div className="grid">{recent.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
      </section>

      <section className="container section" id="sell">
        <div className="cta">
          <div>
            <h2>Selling or letting a property?</h2>
            <p>Reach buyers and renters across the region. Get a free valuation from a local agent.</p>
          </div>
          <button className="btn btn-primary btn-lg">Request a valuation</button>
        </div>
      </section>
    </>
  );
}
