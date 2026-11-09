import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderAt } from '../test/utils';
import { Footer } from './Footer';

test('links to search, the agent application and the logo home', () => {
  renderAt(<Footer />);
  expect(screen.getByRole('link', { name: 'Homes for sale' })).toHaveAttribute('href', '/search?deal=buy');
  expect(screen.getByRole('link', { name: 'Homes for rent' })).toHaveAttribute('href', '/search?deal=rent');
  expect(screen.getByRole('link', { name: 'Land' })).toHaveAttribute('href', '/search?type=Land');
  expect(screen.getByRole('link', { name: 'Become an agent' })).toHaveAttribute('href', '/agent/apply');
  expect(screen.getByRole('link', { name: 'RoFo estate home' })).toHaveAttribute('href', '/');
});

test('shows the current year and says it is a demo', () => {
  renderAt(<Footer />);
  expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} RoFo estate`))).toBeInTheDocument();
});
