import { Link } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { ListingCard } from '../components/ListingCard';
import { listings, popularPlaces } from '../data/listings';
import { placeholderImage } from '../lib/format';

/** Landing page: hero search, popular places, fresh listings. */
export function Home() {
  const fresh = listings.filter((l) => l.isNew || l.openHouse).slice(0, 4);
  const more = listings.slice(0, 8);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <h1>Find a home you will love in the Caribbean</h1>
          <p className="hero-sub">Browse homes, apartments and land for sale or rent.</p>
          <SearchBar />
          <div className="hero-stats">
            <span><strong>{listings.length}</strong> listings</span>
            <span><strong>8</strong> countries</span>
            <span><strong>40+</strong> agencies</span>
          </div>
        </div>
      </section>

      <section className="container section">
        <h2>Popular places</h2>
        <div className="places">
          {popularPlaces.map((p) => (
            <Link key={p.city} to={`/search?q=${encodeURIComponent(p.city)}`} className="place">
              <div className="place-img" style={{ backgroundImage: `url("${placeholderImage(p.hue, 1)}")` }} />
              <div className="place-label">
                <strong>{p.city}</strong>
                <span>{p.country}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>New and open this weekend</h2>
          <Link to="/search">See all</Link>
        </div>
        <div className="grid">
          {fresh.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Recently added</h2>
          <Link to="/search">See all</Link>
        </div>
        <div className="grid">
          {more.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      </section>

      <section className="container section">
        <div className="cta" id="sell">
          <div>
            <h2>Selling your home?</h2>
            <p>Get a free valuation from a local agent.</p>
          </div>
          <button className="btn btn-primary btn-lg">Request valuation</button>
        </div>
      </section>
    </>
  );
}
