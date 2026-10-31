import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Bundlers must serve the worker as its own file. Vite's ?url import does that.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Listing } from '../types';
import { MockMap } from './MockMap';

maplibregl.setWorkerUrl(workerUrl);

/**
 * Default style: OpenFreeMap dark (free, no key). Override with VITE_MAP_STYLE,
 * for example a MapTiler or Stadia style URL, or a self-hosted style.
 */
export const MAP_STYLE: string =
  import.meta.env.VITE_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/dark';

interface Props {
  items: Listing[];
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  /** Single property mode: zoom in close and do not navigate on click. */
  single?: boolean;
}

/** Short label for a pin: 1.9M, 940k, 1450. */
const label = (price: number): string =>
  price >= 1_000_000 ? `${(price / 1e6).toFixed(1)}M` : price >= 10_000 ? `${Math.round(price / 1000)}k` : String(price);

/** MapLibre GL map with price pins. Falls back to the mock map if WebGL is unavailable. */
export default function MapLibreMap({ items, activeId = null, onHover, single }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pins = useRef<Map<string, HTMLElement>>(new Map());
  const markers = useRef<maplibregl.Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  // Keep the latest callback without re-creating the map.
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({ container: box.current, style: MAP_STYLE, center: [-62, 12], zoom: 3.2 });
    } catch {
      setFailed(true); // no WebGL
      return;
    }
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // Rebuild pins and fit the view whenever the results change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    pins.current.clear();

    items.forEach((l) => {
      const el = document.createElement('button');
      el.className = 'gl-pin';
      el.type = 'button';
      el.textContent = label(l.price);
      el.setAttribute('aria-label', `${l.address}, ${l.city}`);
      el.onmouseenter = () => hoverRef.current?.(l.id);
      el.onmouseleave = () => hoverRef.current?.(null);
      if (!single) el.onclick = () => navigate(`/property/${l.id}`);
      pins.current.set(l.id, el);
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([l.lng, l.lat]).addTo(m));
    });

    if (items.length === 1) {
      m.jumpTo({ center: [items[0].lng, items[0].lat], zoom: single ? 14 : 11 });
    } else if (items.length > 1) {
      const b = new maplibregl.LngLatBounds();
      items.forEach((l) => b.extend([l.lng, l.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 12, duration: 600 });
    }
  }, [items, single, navigate]);

  // Highlight the pin that matches the hovered card.
  useEffect(() => {
    pins.current.forEach((el, id) => el.classList.toggle('active', id === activeId));
  }, [activeId, items]);

  if (failed) return <MockMap items={items} activeId={activeId} onHover={onHover ?? (() => {})} />;
  return <div ref={box} className="map-gl" aria-label="Map of results" />;
}
