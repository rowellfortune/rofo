import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { makeInquiry, makeListing, renderAt } from '../../test/utils';
import { Inquiries } from './Inquiries';

const h = vi.hoisted(() => ({ apiListingInquiries: vi.fn(), apiGetListing: vi.fn() }));
vi.mock('../../api/agent', () => ({ apiListingInquiries: h.apiListingInquiries }));
vi.mock('../../api/listings', () => ({ apiGetListing: h.apiGetListing }));

beforeEach(() => {
  h.apiGetListing.mockResolvedValue(makeListing({ id: 'l1', address: 'Kerkplein 1', city: 'Paramaribo' }));
  h.apiListingInquiries.mockResolvedValue([makeInquiry(), makeInquiry({ id: 'q2', name: 'Raj', email: 'raj@x.io', message: 'Price negotiable?' })]);
});
const open = () => renderAt(<Inquiries />, { route: '/agent/l1/inquiries', path: '/agent/:id/inquiries' });

describe('Inquiries', () => {
  test('loads the listing and its messages by the id in the URL', async () => {
    open();
    expect(await screen.findByText('Kerkplein 1, Paramaribo')).toBeInTheDocument();
    expect(h.apiGetListing).toHaveBeenCalledWith('l1');
    expect(h.apiListingInquiries).toHaveBeenCalledWith('l1');
    expect(screen.getByText('Is it still available?')).toBeInTheDocument();
    expect(screen.getByText('Price negotiable?')).toBeInTheDocument();
  });

  test('reply opens an email with the listing in the subject', async () => {
    open();
    await screen.findByText('Kerkplein 1, Paramaribo');
    expect(screen.getByRole('link', { name: 'Reply to raj@x.io' }))
      .toHaveAttribute('href', `mailto:raj@x.io?subject=${encodeURIComponent('Your inquiry about Kerkplein 1')}`);
  });

  test('no messages yet', async () => {
    h.apiListingInquiries.mockResolvedValue([]);
    open();
    expect(await screen.findByText('No inquiries yet.')).toBeInTheDocument();
  });

  test('an error loading messages is shown; a missing listing is not fatal', async () => {
    h.apiGetListing.mockRejectedValue(new Error('gone'));
    h.apiListingInquiries.mockRejectedValue(new Error('Not your listing'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Not your listing');
    expect(screen.getByRole('link', { name: '← Your listings' })).toHaveAttribute('href', '/agent');
  });
});
