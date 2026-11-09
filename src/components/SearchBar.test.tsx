import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { currentUrl, renderAt } from '../test/utils';
import { SearchBar } from './SearchBar';

test('defaults to Buy and searches with the typed place, trimmed', async () => {
  renderAt(<SearchBar />);
  expect(screen.getByRole('tab', { name: 'Buy' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.type(screen.getByRole('textbox', { name: 'Location' }), '  Paramaribo  ');
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(currentUrl()).toBe('/search?deal=buy&q=Paramaribo');
});

test('switching to Rent changes the search', async () => {
  renderAt(<SearchBar />);
  await userEvent.click(screen.getByRole('tab', { name: 'Rent' }));
  expect(screen.getByRole('tab', { name: 'Rent' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Buy' })).toHaveAttribute('aria-selected', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(currentUrl()).toBe('/search?deal=rent'); // an empty box adds no q
});

test('pressing Enter in the box submits too, and blank spaces count as empty', async () => {
  renderAt(<SearchBar />);
  await userEvent.type(screen.getByRole('textbox', { name: 'Location' }), '   {Enter}');
  expect(currentUrl()).toBe('/search?deal=buy');
});
