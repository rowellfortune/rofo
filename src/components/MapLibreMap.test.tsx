import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fake, resetFake } from '../test/maplibreFake';
import { currentUrl, makeListing, renderAt } from '../test/utils';
import MapLibreMap, { MAP_STYLE } from './MapLibreMap';

vi.mock('maplibre-gl', () => import('../test/maplibreFake'));
beforeEach(() => resetFake());

describe('MapLibreMap', () => {
  test('creates one map with the configured style, centered on the Caribbean, and sets the worker', () => {
    renderAt(<MapLibreMap items={[]} />);
    expect(fake.maps).toHaveLength(1);
    expect(fake.maps[0].options.style).toBe(MAP_STYLE);
    expect(fake.maps[0].options.center).toEqual([-62, 12]);
    expect(fake.workerUrl).toMatch(/maplibre-gl-worker/); // the bundling fix: the worker must be its own file
  });

  test('defaults to the free OpenFreeMap dark style', () => {
    expect(MAP_STYLE).toBe('https://tiles.openfreemap.org/styles/dark');
  });

  test('puts one labelled pin per listing at its coordinates', () => {
    const a = makeListing({ price: 1_850_000, address: 'Beach Rd 1', lat: 19.3, lng: -81.3 });
    const b = makeListing({ price: 285_000, address: 'Canal 2', lat: 5.8, lng: -55.1 });
    renderAt(<MapLibreMap items={[a, b]} />);
    expect(screen.getByRole('button', { name: 'Beach Rd 1, Paramaribo' })).toHaveTextContent('1.9M');
    expect(screen.getByRole('button', { name: 'Canal 2, Paramaribo' })).toHaveTextContent('285k');
    expect(fake.markers.map((m) => m.lngLat)).toEqual([[-81.3, 19.3], [-55.1, 5.8]]); // [lng, lat], not the other way round
  });

  test('several results: the camera fits them all', () => {
    renderAt(<MapLibreMap items={[makeListing(), makeListing()]} />);
    const fit = fake.maps[0].calls.find((c) => c.method === 'fitBounds')!;
    expect((fit.args[0] as { points: unknown[] }).points).toHaveLength(2);
  });

  test('one result: jumps to it, closer in on a property page', () => {
    const l = makeListing({ lat: 5.8, lng: -55.2 });
    const { unmount } = renderAt(<MapLibreMap items={[l]} />);
    expect(fake.maps[0].calls[0]).toEqual({ method: 'jumpTo', args: [{ center: [-55.2, 5.8], zoom: 11 }] });
    unmount(); resetFake();
    renderAt(<MapLibreMap items={[l]} single />);
    expect(fake.maps[0].calls[0].args[0]).toMatchObject({ zoom: 14 });
  });

  test('clicking a pin opens the property, except on a property page', () => {
    const l = makeListing({ id: 'go', address: 'Go Street' });
    const { unmount } = renderAt(<MapLibreMap items={[l]} />);
    act(() => screen.getByRole('button', { name: /Go Street/ }).click());
    expect(currentUrl()).toBe('/property/go');
    unmount();
    renderAt(<MapLibreMap items={[l]} single />, { route: '/property/go' });
    act(() => screen.getByRole('button', { name: /Go Street/ }).click());
    expect(currentUrl()).toBe('/property/go'); // no navigation, already there
  });

  test('hovering a pin reports it, and the hovered card\'s pin is highlighted', () => {
    const onHover = vi.fn();
    const a = makeListing({ id: 'a', address: 'A st' }), b = makeListing({ id: 'b', address: 'B st' });
    const { rerender } = renderAt(<MapLibreMap items={[a, b]} onHover={onHover} activeId={null} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /A st/ }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: /A st/ }));
    expect(onHover.mock.calls).toEqual([['a'], [null]]);
    rerender(<MapLibreMap items={[a, b]} onHover={onHover} activeId="b" />);
    expect(screen.getByRole('button', { name: /B st/ })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /A st/ })).not.toHaveClass('active');
  });

  test('new results replace the old pins instead of adding to them', () => {
    const items1 = [makeListing({ address: 'Old 1' }), makeListing({ address: 'Old 2' })];
    const { rerender } = renderAt(<MapLibreMap items={items1} />);
    rerender(<MapLibreMap items={[makeListing({ address: 'New 1' })]} />);
    expect(screen.queryByRole('button', { name: /Old/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(fake.maps).toHaveLength(1); // the map itself is kept
  });

  test('cleans up the map when the page goes away', () => {
    const { unmount } = renderAt(<MapLibreMap items={[]} />);
    unmount();
    expect(fake.maps[0].removed).toBe(true);
  });

  test('without WebGL it falls back to the simple map instead of crashing', () => {
    fake.failOnCreate = true;
    const { container } = renderAt(<MapLibreMap items={[makeListing({ price: 285_000 })]} />);
    expect(container.querySelector('.map')).not.toBeNull();
    expect(screen.getByRole('link', { name: '285k' })).toBeInTheDocument();
  });
});
