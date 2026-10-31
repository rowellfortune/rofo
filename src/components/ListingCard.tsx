import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import { formatPrice, placeholderImage } from '../lib/format';

interface Props {
  listing: Listing;
  /** "row" is the horizontal results layout, "tile" is the home page grid. */
  layout?: 'row' | 'tile';
  highlighted?: boolean;
  onHover?: (id: string | null) => void;
}

/** One property card. Used on the home page and the results list. */
export function ListingCard({ listing: l, layout = 'tile', highlighted, onHover }: Props) {
  return (
    <Link
      to={`/property/${l.id}`}
      className={`card card-${layout}${highlighted ? ' is-highlighted' : ''}`}
      onMouseEnter={() => onHover?.(l.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="card-img" style={{ backgroundImage: `url("${l.images?.[0] ?? placeholderImage(l.hue, 0, l.type)}")` }}>
        {l.isNew && <span className="badge badge-new">New</span>}
        {l.openHouse && <span className="badge badge-open">Open house</span>}
      </div>
      <div className="card-body">
        <div className="card-price">{formatPrice(l.price, l.deal)}</div>
        <div className="card-title">{l.address}</div>
        <div className="muted">{l.city}, {l.country}</div>
        <ul className="specs">
          {l.areaM2 > 0 && <li>{l.areaM2} m²</li>}
          {l.beds > 0 && <li>{l.beds} {l.beds === 1 ? 'bed' : 'beds'}</li>}
          {l.baths > 0 && <li>{l.baths} {l.baths === 1 ? 'bath' : 'baths'}</li>}
          {l.plotM2 && <li>{l.plotM2} m² plot</li>}
        </ul>
        <div className="muted small">{l.agent.agency}</div>
      </div>
    </Link>
  );
}
