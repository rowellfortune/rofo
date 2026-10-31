import { lazy, Suspense } from 'react';
import type { Listing } from '../types';
import { hasCoords } from '../api/mappers';

// MapLibre GL is large. Load it only on pages that show a map.
const MapLibreMap = lazy(() => import('./MapLibreMap'));

interface Props {
  items: Listing[];
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  single?: boolean;
}

/** Map for results and property pages. */
export function ResultsMap({ items, ...rest }: Props) {
  const located = items.filter(hasCoords); // listings without coordinates cannot be pinned
  return (
    <Suspense fallback={<div className="map-gl map-loading">Loading map...</div>}>
      <MapLibreMap items={located} {...rest} />
    </Suspense>
  );
}
