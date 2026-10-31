import type { GeoCandidate, Listing, PropertyType } from '../types';

/** One photo in the form. `key` is the S3 key. `preview` is what we show. */
export interface FormImage { key: string; preview: string }

/** Everything the listing form edits. Numbers stay as strings until we validate them. */
export interface ListingForm {
  deal: 'buy' | 'rent';
  type: PropertyType;
  title: string;
  address: string;
  city: string;
  country: string;
  price: string;
  beds: string;
  baths: string;
  areaM2: string;
  plotM2: string;
  yearBuilt: string;
  isNew: boolean;
  openHouse: string;
  description: string;
  features: string; // comma separated
  agency: string;
  phone: string;
  lat: string;
  lng: string;
  images: FormImage[];
}

/** The GraphQL ListingInput the API expects. */
export interface ListingInputPayload {
  deal: 'buy' | 'rent'; type: PropertyType; title: string; address: string; city: string; country: string;
  price: number; beds: number; baths: number; areaM2: number; plotM2: number | null; yearBuilt: number | null;
  isNew: boolean; openHouse: string | null; description: string; features: string[]; images: string[];
  lat: number | null; lng: number | null; agency: string; phone: string;
}

export type FormErrors = Partial<Record<keyof ListingForm, string>>;

export const emptyForm = (profile?: { agency?: string; phone?: string }): ListingForm => ({
  deal: 'buy', type: 'House', title: '', address: '', city: '', country: '', price: '', beds: '0', baths: '0',
  areaM2: '0', plotM2: '', yearBuilt: '', isNew: false, openHouse: '', description: '', features: '',
  agency: profile?.agency ?? '', phone: profile?.phone ?? '', lat: '', lng: '', images: [],
});

/** Existing listing to form values (edit page). */
export function listingToForm(l: Listing): ListingForm {
  return {
    deal: l.deal, type: l.type, title: l.title, address: l.address, city: l.city, country: l.country,
    price: String(l.price), beds: String(l.beds), baths: String(l.baths), areaM2: String(l.areaM2),
    plotM2: l.plotM2 ? String(l.plotM2) : '', yearBuilt: l.yearBuilt ? String(l.yearBuilt) : '',
    isNew: l.isNew, openHouse: l.openHouse ?? '', description: l.description, features: l.features.join(', '),
    agency: l.agent.agency, phone: l.agent.phone,
    lat: Number.isFinite(l.lat) ? String(l.lat) : '', lng: Number.isFinite(l.lng) ? String(l.lng) : '',
    images: (l.imageKeys ?? []).map((key, i) => ({ key, preview: l.images?.[i] ?? '' })),
  };
}

/** Parse a whole number. Empty means "not set". Returns NaN for junk. */
const int = (v: string): number | null => (v.trim() === '' ? null : /^-?\d+$/.test(v.trim()) ? Number(v) : NaN);

/**
 * Validate the form. Mirrors the server rules in backend/lib/listings.ts so people see
 * problems before sending. The server still checks everything again.
 */
export function buildListingInput(f: ListingForm): { ok: true; input: ListingInputPayload } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const need = (k: keyof ListingForm, v: string, min: number, label: string) => {
    if (v.trim().length < min) errors[k] = `${label} needs at least ${min} characters`;
  };
  need('title', f.title, 3, 'Title'); need('address', f.address, 3, 'Address');
  need('city', f.city, 2, 'City'); need('country', f.country, 2, 'Country');
  need('description', f.description, 10, 'Description');
  need('agency', f.agency, 2, 'Agency'); need('phone', f.phone, 5, 'Phone');

  const price = Number(f.price);
  if (!f.price.trim() || !Number.isFinite(price) || price <= 0) errors.price = 'Enter a price above 0';

  const beds = int(f.beds) ?? 0, baths = int(f.baths) ?? 0, area = int(f.areaM2) ?? 0;
  if (!Number.isInteger(beds) || beds < 0 || beds > 50) errors.beds = 'Whole number from 0 to 50';
  if (!Number.isInteger(baths) || baths < 0 || baths > 50) errors.baths = 'Whole number from 0 to 50';
  if (!Number.isInteger(area) || area < 0) errors.areaM2 = 'Whole number, 0 or more';

  const plot = int(f.plotM2);
  if (plot !== null && (!Number.isInteger(plot) || plot < 0)) errors.plotM2 = 'Whole number, 0 or more';
  const year = int(f.yearBuilt);
  if (year !== null && (!Number.isInteger(year) || year < 1500 || year > 2100)) errors.yearBuilt = 'Year from 1500 to 2100';

  // Coordinates: both or neither.
  const hasLat = f.lat.trim() !== '', hasLng = f.lng.trim() !== '';
  const lat = hasLat ? Number(f.lat) : null, lng = hasLng ? Number(f.lng) : null;
  if (hasLat !== hasLng) { errors.lat = 'Set both latitude and longitude'; }
  else if (lat !== null && lng !== null) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = 'Latitude from -90 to 90';
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = 'Longitude from -180 to 180';
  }

  const features = f.features.split(',').map((x) => x.trim()).filter(Boolean);
  if (features.length > 30 || features.some((x) => x.length > 60)) errors.features = 'Up to 30 features, 60 characters each';
  if (f.images.length > 20) errors.images = 'Up to 20 photos';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      deal: f.deal, type: f.type, title: f.title.trim(), address: f.address.trim(), city: f.city.trim(),
      country: f.country.trim(), price, beds, baths, areaM2: area, plotM2: plot, yearBuilt: year,
      isNew: f.isNew, openHouse: f.openHouse.trim() || null, description: f.description.trim(), features,
      images: f.images.map((i) => i.key), lat, lng, agency: f.agency.trim(), phone: f.phone.trim(),
    },
  };
}

/** The text to search for: street, city and country joined. Needs a street of 3+ characters. */
export function geocodeQuery(f: Pick<ListingForm, 'address' | 'city' | 'country'>): string | null {
  if (f.address.trim().length < 3) return null;
  return [f.address, f.city, f.country].map((x) => x.trim()).filter(Boolean).join(', ');
}

/**
 * Apply a chosen place to the form. Sets the pin. Fills city and country only when blank,
 * so the agent's own wording is never overwritten.
 */
export function applyCandidate(f: ListingForm, c: GeoCandidate): ListingForm {
  return {
    ...f,
    lat: String(Math.round(c.lat * 1e5) / 1e5),
    lng: String(Math.round(c.lng * 1e5) / 1e5),
    city: f.city.trim() ? f.city : c.city ?? '',
    country: f.country.trim() ? f.country : c.country ?? '',
  };
}
