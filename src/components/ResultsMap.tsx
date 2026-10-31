import { lazy, Suspense } from 'react';
import type { Listing } from '../types';

// MapLibre GL is large. Load it only on pages that show a map.
const MapLibreMap = lazy(() => import('./MapLibreMap'));

interface Props {
  items: Listing[];
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  single?: boolean;
}

/** Map for results and property pages. */
export function ResultsMap(props: Props) {
  return (
    <Suspense fallback={<div className="map-gl map-loading">Loading map...</div>}>
      <MapLibreMap {...props} />
    </Suspense>
  );
}
