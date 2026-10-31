import { Link } from 'react-router-dom';
import type { Listing } from '../types';

interface Props {
  items: Listing[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}

/** Stylised map with price pins. Replace with Mapbox or Leaflet later. */
export function MockMap({ items, activeId, onHover }: Props) {
  return (
    <div className="map" aria-label="Map of results">
      <div className="map-water" />
      {items.map((l) => (
        <Link
          key={l.id}
          to={`/property/${l.id}`}
          className={`pin${activeId === l.id ? ' active' : ''}`}
          style={{ top: `${l.lat}%`, left: `${l.lng}%` }}
          onMouseEnter={() => onHover(l.id)}
          onMouseLeave={() => onHover(null)}
        >
          {l.price >= 1000000 ? `${(l.price / 1e6).toFixed(1)}M` : l.price >= 10000 ? `${Math.round(l.price / 1000)}k` : l.price}
        </Link>
      ))}
    </div>
  );
}
