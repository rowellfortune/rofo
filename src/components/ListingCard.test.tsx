import { fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { makeListing, renderAt } from '../test/utils';
import { ListingCard } from './ListingCard';

test('shows price, address, place, specs and agency, and links to the property', () => {
  const l = makeListing({ id: 'abc', price: 285000, address: 'Gravenstraat 48', beds: 4, baths: 2, areaM2: 190, plotM2: 450 });
  renderAt(<ListingCard listing={l} />);
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', '/property/abc');
  expect(link).toHaveTextContent('$285,000');
  expect(link).toHaveTextContent('Gravenstraat 48');
  expect(link).toHaveTextContent('Paramaribo, Suriname');
  for (const spec of ['190 m²', '4 beds', '2 baths', '450 m² plot', 'Palm Realty']) expect(link).toHaveTextContent(spec);
});

test('rentals show a monthly price', () => {
  renderAt(<ListingCard listing={makeListing({ deal: 'rent', price: 1450 })} />);
  expect(screen.getByRole('link')).toHaveTextContent('$1,450 /mo');
});

test('one bed and one bath read in the singular', () => {
  renderAt(<ListingCard listing={makeListing({ beds: 1, baths: 1 })} />);
  const text = screen.getByRole('link').textContent!;
  expect(text).toMatch(/1 bed(?!s)/);
  expect(text).toMatch(/1 bath(?!s)/);
});

test('land with no rooms or area shows only the plot', () => {
  renderAt(<ListingCard listing={makeListing({ type: 'Land', beds: 0, baths: 0, areaM2: 0, plotM2: 1800 })} />);
  const items = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual(['1800 m² plot']);
});

test('New and Open house badges appear only when set', () => {
  const { unmount } = renderAt(<ListingCard listing={makeListing({ isNew: true, openHouse: 'Sat 11:00' })} />);
  expect(screen.getByText('New')).toBeInTheDocument();
  expect(screen.getByText('Open house')).toBeInTheDocument();
  unmount();
  renderAt(<ListingCard listing={makeListing({ isNew: false, openHouse: undefined })} />);
  expect(screen.queryByText('New')).not.toBeInTheDocument();
  expect(screen.queryByText('Open house')).not.toBeInTheDocument();
});

test('uses the first uploaded photo when there is one, otherwise the illustration', () => {
  const { container, unmount } = renderAt(<ListingCard listing={makeListing({ images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] })} />);
  expect((container.querySelector('.card-img') as HTMLElement).style.backgroundImage).toContain('https://cdn.test/a.jpg');
  unmount();
  const second = renderAt(<ListingCard listing={makeListing({ images: undefined })} />);
  expect((second.container.querySelector('.card-img') as HTMLElement).style.backgroundImage).toContain('data:image/svg+xml');
});

test('reports hover in and out, so the map can highlight the pin', () => {
  const onHover = vi.fn();
  renderAt(<ListingCard listing={makeListing({ id: 'h1' })} onHover={onHover} />);
  fireEvent.mouseEnter(screen.getByRole('link'));
  fireEvent.mouseLeave(screen.getByRole('link'));
  expect(onHover.mock.calls).toEqual([['h1'], [null]]);
});

test('layout and highlight classes', () => {
  renderAt(<ListingCard listing={makeListing()} layout="row" highlighted />);
  expect(screen.getByRole('link')).toHaveClass('card-row', 'is-highlighted');
});
