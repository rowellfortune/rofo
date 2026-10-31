/** Whether a listing is for sale or for rent. */
export type Deal = 'buy' | 'rent';

/** Property categories shown in filters. */
export type PropertyType = 'House' | 'Apartment' | 'Villa' | 'Land' | 'Commercial';

/** One property listing. Prices are stored in USD. */
export interface Listing {
  id: string;
  deal: Deal;
  type: PropertyType;
  title: string;
  address: string;
  city: string;
  country: string;
  price: number; // USD. For rent this is per month.
  beds: number;
  baths: number;
  areaM2: number; // living area
  plotM2?: number; // plot size
  yearBuilt: number;
  isNew: boolean;
  openHouse?: string;
  description: string;
  features: string[];
  hue: number; // drives the placeholder image color
  lat: number; // map position (0-100 percent of the mock map)
  lng: number;
  agent: { name: string; agency: string; phone: string };
}

/** Filter state shared by the search bar and results page. */
export interface Filters {
  deal: Deal;
  q: string;
  type: string;
  minPrice: string;
  maxPrice: string;
  beds: string;
  sort: 'newest' | 'price-asc' | 'price-desc' | 'area-desc';
}
