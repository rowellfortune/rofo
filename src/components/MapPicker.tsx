import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE } from './MapLibreMap'; // also sets the worker URL

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

/** Click the map or drag the pin to set a listing's coordinates. No geocoding service needed. */
export default function MapPicker({ lat, lng, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: box.current, style: MAP_STYLE,
        center: lat !== null && lng !== null ? [lng, lat] : [-62, 12], zoom: lat !== null ? 13 : 3.2,
      });
    } catch { return; } // no WebGL: the number fields still work
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('click', (e) => change.current(round(e.lngLat.lat), round(e.lngLat.lng)));
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once, later changes go through the effect below
  }, []);

  // Keep the pin in sync with the fields.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat === null || lng === null) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = new maplibregl.Marker({ draggable: true, color: '#4c68f5' }).setLngLat([lng, lat]).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLngLat();
        change.current(round(p.lat), round(p.lng));
      });
    } else marker.current.setLngLat([lng, lat]);
    m.easeTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 12), duration: 400 });
  }, [lat, lng]);

  return <div ref={box} className="map-gl picker" aria-label="Pick the location on the map" />;
}

/** Five decimals is about one metre. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;
