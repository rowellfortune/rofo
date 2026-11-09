/**
 * A stand-in for the maplibre-gl library. jsdom has no WebGL, so the real map cannot run in tests.
 * It records what the app asked for (camera moves, markers) and puts marker elements into the page,
 * so tests can hover and click pins exactly like a user would.
 * Use with: vi.mock('maplibre-gl', () => import('../test/maplibreFake'))
 */
type Handler = (e: any) => void;

/** Everything the fake saw. Reset between tests with resetFake(). */
export const fake = {
  failOnCreate: false,
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  workerUrl: '' as string,
};

export function resetFake(): void {
  fake.failOnCreate = false;
  fake.maps = [];
  fake.markers = [];
}

export function setWorkerUrl(url: string): void { fake.workerUrl = url; }

export class NavigationControl {
  options: unknown;
  constructor(options: unknown) { this.options = options; }
}

export class LngLatBounds {
  points: [number, number][] = [];
  extend(p: [number, number]) { this.points.push(p); return this; }
}

export class Map {
  options: any;
  container: HTMLElement;
  controls: unknown[] = [];
  handlers: Record<string, Handler[]> = {};
  calls: { method: string; args: unknown[] }[] = [];
  removed = false;
  zoom: number;
  constructor(options: any) {
    if (fake.failOnCreate) throw new Error('WebGL not supported');
    this.options = options;
    this.container = options.container;
    this.zoom = options.zoom ?? 0;
    fake.maps.push(this);
  }
  addControl(c: unknown) { this.controls.push(c); return this; }
  on(event: string, h: Handler) { (this.handlers[event] ??= []).push(h); return this; }
  /** Test helper: fire a map event such as a click. */
  fire(event: string, e: unknown) { (this.handlers[event] ?? []).forEach((h) => h(e)); }
  jumpTo(...args: unknown[]) { this.calls.push({ method: 'jumpTo', args }); }
  fitBounds(...args: unknown[]) { this.calls.push({ method: 'fitBounds', args }); }
  easeTo(...args: unknown[]) { this.calls.push({ method: 'easeTo', args }); }
  getZoom() { return this.zoom; }
  remove() { this.removed = true; }
}
type FakeMap = Map;

export class Marker {
  options: any;
  element: HTMLElement;
  lngLat: [number, number] = [0, 0];
  map: Map | null = null;
  handlers: Record<string, Handler[]> = {};
  removed = false;
  constructor(options: any = {}) {
    this.options = options;
    this.element = options.element ?? document.createElement('div');
    fake.markers.push(this);
  }
  setLngLat(p: [number, number]) { this.lngLat = p; return this; }
  getLngLat() { return { lng: this.lngLat[0], lat: this.lngLat[1] }; }
  addTo(m: Map) { this.map = m; m.container.appendChild(this.element); return this; }
  on(event: string, h: Handler) { (this.handlers[event] ??= []).push(h); return this; }
  /** Test helper: fire a marker event such as dragend. */
  fire(event: string) { (this.handlers[event] ?? []).forEach((h) => h({})); }
  remove() { this.removed = true; this.element.remove(); }
}
type FakeMarker = Marker;
