import { act, render } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { fake, resetFake } from '../test/maplibreFake';
import MapPicker from './MapPicker';

vi.mock('maplibre-gl', () => import('../test/maplibreFake'));
beforeEach(() => resetFake());

test('with no pin yet it starts zoomed out on the Caribbean', () => {
  render(<MapPicker lat={null} lng={null} onChange={() => {}} />);
  expect(fake.maps[0].options).toMatchObject({ center: [-62, 12], zoom: 3.2 });
  expect(fake.markers).toHaveLength(0);
});

test('with a pin it starts on it and shows a draggable marker', () => {
  render(<MapPicker lat={5.8} lng={-55.2} onChange={() => {}} />);
  expect(fake.maps[0].options).toMatchObject({ center: [-55.2, 5.8], zoom: 13 });
  expect(fake.markers).toHaveLength(1);
  expect(fake.markers[0].options.draggable).toBe(true);
  expect(fake.markers[0].lngLat).toEqual([-55.2, 5.8]);
});

test('clicking the map reports the spot, rounded to five decimals', () => {
  const onChange = vi.fn();
  render(<MapPicker lat={null} lng={null} onChange={onChange} />);
  act(() => fake.maps[0].fire('click', { lngLat: { lat: 5.823456789, lng: -55.167891234 } }));
  expect(onChange).toHaveBeenCalledWith(5.82346, -55.16789);
});

test('dragging the pin reports where it was dropped', () => {
  const onChange = vi.fn();
  render(<MapPicker lat={5.8} lng={-55.2} onChange={onChange} />);
  fake.markers[0].setLngLat([-55.123456, 5.987654]);
  act(() => fake.markers[0].fire('dragend'));
  expect(onChange).toHaveBeenCalledWith(5.98765, -55.12346);
});

test('typing new coordinates moves the existing pin instead of making another', () => {
  const { rerender } = render(<MapPicker lat={5.8} lng={-55.2} onChange={() => {}} />);
  rerender(<MapPicker lat={6} lng={-56} onChange={() => {}} />);
  expect(fake.markers).toHaveLength(1);
  expect(fake.markers[0].lngLat).toEqual([-56, 6]);
  expect(fake.maps[0].calls.at(-1)).toMatchObject({ method: 'easeTo' });
});

test('clearing the coordinates removes the pin', () => {
  const { rerender } = render(<MapPicker lat={5.8} lng={-55.2} onChange={() => {}} />);
  rerender(<MapPicker lat={null} lng={null} onChange={() => {}} />);
  expect(fake.markers[0].removed).toBe(true);
});

test('the latest onChange is used, so a re-render never reports to a stale handler', () => {
  const first = vi.fn(), second = vi.fn();
  const { rerender } = render(<MapPicker lat={null} lng={null} onChange={first} />);
  rerender(<MapPicker lat={null} lng={null} onChange={second} />);
  act(() => fake.maps[0].fire('click', { lngLat: { lat: 1, lng: 2 } }));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith(1, 2);
});

test('without WebGL it renders nothing broken, the number fields still work', () => {
  fake.failOnCreate = true;
  const { container } = render(<MapPicker lat={5.8} lng={-55.2} onChange={() => {}} />);
  expect(container.querySelector('.picker')).not.toBeNull();
  expect(fake.markers).toHaveLength(0);
});
