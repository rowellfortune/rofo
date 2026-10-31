import type { GeoCandidate, Inquiry, Listing } from '../types';
import type { ListingInputPayload } from '../lib/listingForm';
import { clearListingCache } from './listings';
import { toListing, type ApiListing } from './mappers';
import { Q } from './queries';
import { transport } from './transport';

/** The signed-in agent's own listings, newest first. */
export async function apiMyListings(): Promise<Listing[]> {
  const rows = await transport.call<ApiListing[] | null>('myListings', Q.myListings, {}, 'userPool');
  return (rows ?? []).map(toListing);
}

/** Create a listing owned by the caller. Returns the new id. */
export async function apiCreateListing(input: ListingInputPayload): Promise<string> {
  const row = await transport.call<{ id: string }>('createListing', Q.createListing, { input }, 'userPool');
  return row.id;
}

/** Replace a listing's fields. Owner or Admin only. Clears the read cache so pages refetch. */
export async function apiUpdateListing(id: string, input: ListingInputPayload): Promise<void> {
  await transport.call('updateListing', Q.updateListing, { id, input }, 'userPool');
  clearListingCache(id);
}

/** Delete a listing. Owner or Admin only. */
export async function apiDeleteListing(id: string): Promise<void> {
  await transport.call('deleteListing', Q.deleteListing, { id }, 'userPool');
  clearListingCache(id);
}

/** Inquiries buyers sent for one listing, newest first. */
export async function apiListingInquiries(listingId: string): Promise<Inquiry[]> {
  const rows = await transport.call<Inquiry[] | null>('listingInquiries', Q.listingInquiries, { listingId }, 'userPool');
  return rows ?? [];
}

/** Turn an address into candidate places (agents only). Results are cached on the server. */
export async function apiGeocode(query: string): Promise<GeoCandidate[]> {
  const rows = await transport.call<GeoCandidate[] | null>('geocodeAddress', Q.geocodeAddress, { query }, 'userPool');
  return rows ?? [];
}
