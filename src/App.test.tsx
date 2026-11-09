import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './state/AuthContext';
import { PoolsProvider } from './state/PoolsContext';

// Full app in demo mode with the real providers. Only the WebGL map is stubbed.
vi.mock('./components/ResultsMap', () => ({ ResultsMap: () => <div data-testid="map" /> }));

const at = (route: string) => render(
  <MemoryRouter initialEntries={[route]}>
    <AuthProvider><PoolsProvider><App /></PoolsProvider></AuthProvider>
  </MemoryRouter>,
);

describe('App routes (demo mode)', () => {
  test.each([
    ['/', /Find, rent and buy property/],
    ['/search', /\d+ properties/],
    ['/property/l1', /Seven Mile Beach Rd 12/],
    ['/pools', /Buy a home together/],
    ['/pools/new', /Start a pool/],
    ['/pools/p1', /Wanica Families Home Fund/],
  ])('%s renders its page', async (route, heading) => {
    at(route);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  test.each(['/login', '/account', '/agent/apply'])('%s explains the demo build has no accounts', (route) => {
    at(route);
    expect(screen.getByText(/backend is connected/)).toBeInTheDocument();
  });

  test.each(['/agent', '/agent/new', '/agent/x/edit', '/agent/x/inquiries', '/admin/applications'])('%s is guarded', (route) => {
    at(route);
    expect(screen.getByText(/demo build/)).toBeInTheDocument();
  });

  test('unknown paths show not found, with header and footer still there', () => {
    at('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
