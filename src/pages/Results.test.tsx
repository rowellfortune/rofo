import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { listings } from '../data/listings';
import { currentUrl, renderAt } from '../test/utils';
import { Results } from './Results';

// The real map is tested on its own. Here a stub shows how many pins it got.
vi.mock('../components/ResultsMap', () => ({
  ResultsMap: ({ items }: { items: unknown[] }) => <div data-testid="map">{items.length} pins</div>,
}));

const rentCount = listings.filter((l) => l.deal === 'rent').length;

describe('Results', () => {
  test('no filters: every demo listing, and the map gets the same list', () => {
    renderAt(<Results />, { route: '/search' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${listings.length} properties`);
    expect(screen.getByTestId('map')).toHaveTextContent(`${listings.length} pins`);
  });

  test('filters come from the URL, so a shared link shows the same results', () => {
    renderAt(<Results />, { route: '/search?deal=rent' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${rentCount} ${rentCount === 1 ? 'property' : 'properties'}`);
    expect(screen.getByRole('combobox', { name: 'Buy or rent' })).toHaveValue('rent');
  });

  test('changing a filter writes it to the URL', async () => {
    const user = userEvent.setup();
    renderAt(<Results />, { route: '/search' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Property type' }), 'Villa');
    expect(currentUrl()).toBe('/search?type=Villa');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'price-asc');
    expect(currentUrl()).toBe('/search?type=Villa&sort=price-asc');
  });

  test('emptying a field removes it from the URL', async () => {
    const user = userEvent.setup();
    renderAt(<Results />, { route: '/search?q=Nassau' });
    await user.clear(screen.getByRole('textbox', { name: 'Location' }));
    expect(currentUrl()).toBe('/search');
  });

  test('Clear removes every filter', async () => {
    const user = userEvent.setup();
    renderAt(<Results />, { route: '/search?deal=buy&min=100000&beds=3' });
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(currentUrl()).toBe('/search');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${listings.length} properties`);
  });

  test('no matches: a hint to remove a filter', () => {
    renderAt(<Results />, { route: '/search?q=Atlantis' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('0 properties');
    expect(screen.getByText('No results. Try removing a filter.')).toBeInTheDocument();
  });

  test('one match uses the singular', () => {
    renderAt(<Results />, { route: '/search?q=Seven Mile Beach' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1 property');
  });
});
