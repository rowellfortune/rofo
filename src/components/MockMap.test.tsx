import { fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { makeListing, renderAt } from '../test/utils';
import { MockMap } from './MockMap';

test('one pin per listing, with short price labels', () => {
  const items = [makeListing({ price: 1_850_000 }), makeListing({ price: 285_000 }), makeListing({ price: 1450, deal: 'rent' })];
  renderAt(<MockMap items={items} activeId={null} onHover={() => {}} />);
  expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['1.9M', '285k', '1450']);
});

test('pins link to the property and report hover', () => {
  const onHover = vi.fn();
  const l = makeListing({ id: 'pin1' });
  renderAt(<MockMap items={[l]} activeId={null} onHover={onHover} />);
  const pin = screen.getByRole('link');
  expect(pin).toHaveAttribute('href', '/property/pin1');
  fireEvent.mouseEnter(pin); fireEvent.mouseLeave(pin);
  expect(onHover.mock.calls).toEqual([['pin1'], [null]]);
});

test('the hovered card\'s pin is marked active', () => {
  const a = makeListing({ id: 'a' }), b = makeListing({ id: 'b' });
  renderAt(<MockMap items={[a, b]} activeId="b" onHover={() => {}} />);
  const [pa, pb] = screen.getAllByRole('link');
  expect(pa).not.toHaveClass('active');
  expect(pb).toHaveClass('active');
});

test('pins are placed by their coordinates: north is up, east is right', () => {
  const north = makeListing({ id: 'n', lat: 10, lng: -60 }), south = makeListing({ id: 's', lat: 5, lng: -55 });
  renderAt(<MockMap items={[north, south]} activeId={null} onHover={() => {}} />);
  const [pn, ps] = screen.getAllByRole('link') as HTMLElement[];
  expect(parseFloat(pn.style.top)).toBeLessThan(parseFloat(ps.style.top)); // north sits higher
  expect(parseFloat(pn.style.left)).toBeLessThan(parseFloat(ps.style.left)); // west sits further left
});

test('a single listing sits in the middle instead of dividing by zero', () => {
  renderAt(<MockMap items={[makeListing()]} activeId={null} onHover={() => {}} />);
  const pin = screen.getByRole('link') as HTMLElement;
  expect(pin.style.top).toBe('50%');
  expect(pin.style.left).toBe('50%');
});
