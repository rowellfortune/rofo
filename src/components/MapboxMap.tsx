import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Listing } from '../types';

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

/** Mapbox GL map with price pins. Loaded lazily so the bundle only grows on map pages. */
export default function MapboxMap({ items, activeId, onHover, single }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pins = useRef<Map<string, HTMLElement>>(new Map());
  const markers = useRef<mapboxgl.Marker[]>([]);
  const navigate = useNavigate();
  // Keep the latest callbacks without re-creating the map.
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
    const m = new mapboxgl.Map({
      container: box.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-62, 12], // Caribbean
      zoom: 3.2,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
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
      el.className = 'mb-pin';
      el.type = 'button';
      el.textContent = label(l.price);
      el.setAttribute('aria-label', `${l.address}, ${l.city}`);
      el.onmouseenter = () => hoverRef.current?.(l.id);
      el.onmouseleave = () => hoverRef.current?.(null);
      if (!single) el.onclick = () => navigate(`/property/${l.id}`);
      pins.current.set(l.id, el);
      markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat([l.lng, l.lat]).addTo(m));
    });

    if (items.length === 1) {
      m.jumpTo({ center: [items[0].lng, items[0].lat], zoom: single ? 14 : 11 });
    } else if (items.length > 1) {
      const b = new mapboxgl.LngLatBounds();
      items.forEach((l) => b.extend([l.lng, l.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 12, duration: 600 });
    }
  }, [items, single, navigate]);

  // Highlight the pin that matches the hovered card.
  useEffect(() => {
    pins.current.forEach((el, id) => el.classList.toggle('active', id === activeId));
  }, [activeId, items]);

  return <div ref={box} className="mapbox" aria-label="Map of results" />;
}
