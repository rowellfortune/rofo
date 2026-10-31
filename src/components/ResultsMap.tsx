import { lazy, Suspense } from 'react';
import type { Listing } from '../types';
import { MockMap } from './MockMap';

// Mapbox GL is large. Load it only when a token exists and a map is shown.
const MapboxMap = lazy(() => import('./MapboxMap'));

/** True when a Mapbox token is configured. */
export const hasMapbox = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

interface Props {
  items: Listing[];
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  single?: boolean;
}

/** Real Mapbox map when a token is set, otherwise the mock map. */
export function ResultsMap({ items, activeId = null, onHover = () => {}, single }: Props) {
  if (!hasMapbox) return <MockMap items={items} activeId={activeId} onHover={onHover} />;
  return (
    <Suspense fallback={<div className="mapbox map-loading">Loading map...</div>}>
      <MapboxMap items={items} activeId={activeId} onHover={onHover} single={single} />
    </Suspense>
  );
}
