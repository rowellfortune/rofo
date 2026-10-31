import { Link } from 'react-router-dom';
import type { Listing } from '../types';

interface Props {
  items: Listing[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}

/** Stylised map with price pins. Fallback when WebGL is unavailable. */
export function MockMap({ items, activeId, onHover }: Props) {
  // Project real coordinates into the box, with padding, using the bounds of the current results.
  const lats = items.map((l) => l.lat), lngs = items.map((l) => l.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pos = (v: number, lo: number, hi: number) => (hi === lo ? 50 : 12 + ((v - lo) / (hi - lo)) * 76);

  return (
    <div className="map" aria-label="Map of results">
      <div className="map-water" />
      {items.map((l) => (
        <Link
          key={l.id}
          to={`/property/${l.id}`}
          className={`pin${activeId === l.id ? ' active' : ''}`}
          style={{ top: `${100 - pos(l.lat, minLat, maxLat)}%`, left: `${pos(l.lng, minLng, maxLng)}%` }}
          onMouseEnter={() => onHover(l.id)}
          onMouseLeave={() => onHover(null)}
        >
          {l.price >= 1000000 ? `${(l.price / 1e6).toFixed(1)}M` : l.price >= 10000 ? `${Math.round(l.price / 1000)}k` : l.price}
        </Link>
      ))}
    </div>
  );
}
