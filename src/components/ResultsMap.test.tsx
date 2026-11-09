import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { makeListing } from '../test/utils';
import type { Listing } from '../types';
import { ResultsMap } from './ResultsMap';

// Replace the heavy map with a probe that shows what it was given.
// The module loads after a short delay, like a real download, so the fallback can be seen.
vi.mock('./MapLibreMap', async () => {
  await new Promise((r) => setTimeout(r, 30));
  return { default: (p: { items: Listing[]; single?: boolean; activeId?: string | null }) =>
    <div data-testid="map">{p.items.map((l) => l.id).join(',')}|single={String(Boolean(p.single))}|active={String(p.activeId)}</div> };
});

test('shows a loading message while the map code downloads, then the map', async () => {
  render(<ResultsMap items={[]} />);
  expect(screen.getByText('Loading map...')).toBeInTheDocument();
  expect(await screen.findByTestId('map')).toBeInTheDocument();
  expect(screen.queryByText('Loading map...')).not.toBeInTheDocument();
});

test('only listings with real coordinates reach the map', async () => {
  const items = [
    makeListing({ id: 'ok', lat: 5.8, lng: -55.2 }),
    makeListing({ id: 'nan', lat: NaN, lng: NaN }), // not geocoded yet
    makeListing({ id: 'zero', lat: 0, lng: 0 }), // the "null island" placeholder
  ];
  render(<ResultsMap items={items} activeId="ok" single />);
  expect(await screen.findByTestId('map')).toHaveTextContent('ok|single=true|active=ok');
});
