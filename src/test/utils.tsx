/**
 * Shared helpers for component tests: a router wrapper that reports where a page navigated to,
 * and factories for realistic test data.
 */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AgentApplication, Inquiry, Listing, Pool } from '../types';

/** Prints the current URL into the page so tests can read where navigation went. */
function LocationProbe() {
  const loc = useLocation();
  return <span hidden data-testid="location">{loc.pathname + loc.search}</span>;
}

/**
 * Render inside a router at `route`. `path` is the route pattern for pages that read params,
 * for example "/property/:id".
 */
export function renderAt(ui: ReactElement, { route = '/', path = '*' }: { route?: string; path?: string } = {}): RenderResult {
  const wrap = (el: ReactElement) => (
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={<>{el}<LocationProbe /></>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
  const result = render(wrap(ui));
  // Keep the router when a test re-renders with new props.
  return { ...result, rerender: (next: ReactNode) => result.rerender(wrap(next as ReactElement)) };
}

/** The URL the app is on now (after renderAt). */
export const currentUrl = (): string => document.querySelector('[data-testid="location"]')?.textContent ?? '';

let seq = 0;

/** A listing with sensible values. Override what the test cares about. */
export function makeListing(over: Partial<Listing> = {}): Listing {
  seq++;
  return {
    id: `l${seq}`, deal: 'buy', type: 'House', title: `Home ${seq}`, address: `Street ${seq}`, city: 'Paramaribo',
    country: 'Suriname', price: 100000 * seq, beds: 3, baths: 2, areaM2: 120, plotM2: 300, yearBuilt: 2018, isNew: false,
    description: 'A lovely home with a garden.', features: ['Garden', 'Carport'], hue: 120, lat: 5.82, lng: -55.17,
    agent: { name: 'Maya Linden', agency: 'Palm Realty', phone: '+597 555 0100' },
    ...over,
  };
}

/** A pool with two members and a little money in it. */
export function makePool(over: Partial<Pool> = {}): Pool {
  return {
    id: 'p1', name: 'Canal Home Fund', listingId: 'l-pool', maxMembers: 4, targetMonths: 24, createdAt: '2026-01-02T00:00:00.000Z',
    members: [
      { id: 'u1', name: 'Anita', monthly: 200, contributed: 600, joinedAt: '2026-01-02' },
      { id: 'u2', name: 'Kevin', monthly: 150, contributed: 200, joinedAt: '2026-01-03' },
    ],
    ledger: [
      { id: 'e1', memberId: 'u1', amount: 600, date: '2026-02-01', note: 'Contribution', reference: 'REF-1' },
      { id: 'e2', memberId: 'u2', amount: 200, date: '2026-02-02', note: 'Contribution', reference: 'REF-2' },
    ],
    proposals: [],
    ...over,
  };
}

/** An agent application. */
export function makeApplication(over: Partial<AgentApplication> = {}): AgentApplication {
  return {
    userId: 'u-app', email: 'agent@rofo.test', name: 'Alex Agent', agency: 'Alex Realty', phone: '+597 555 0100',
    registrationNo: 'KKF-9', country: 'Suriname', website: null, about: 'Selling homes in Paramaribo for ten years.',
    status: 'PENDING', reviewNote: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    reviewedAt: null, ...over,
  };
}

/** A buyer's inquiry. */
export const makeInquiry = (over: Partial<Inquiry> = {}): Inquiry => ({
  id: 'q1', listingId: 'l1', name: 'Maria', email: 'maria@x.io', message: 'Is it still available?', createdAt: '2026-03-01T10:00:00.000Z', ...over,
});
