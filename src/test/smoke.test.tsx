import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderAt } from './utils';

// Proves the test setup itself works before the real suites rely on it.
test('the test setup renders React into jsdom', () => {
  renderAt(<h1>Hello</h1>, { route: '/x?y=1' });
  expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/x?y=1');
});
