import type { Listing } from '../types';

/** Default agent used by several mock listings. */
const agent = { name: 'Maya Linden', agency: 'Palm & Pier Realty', phone: '+1 555 0142' };

/** Mock listings across the Caribbean. Swap for an API later. */
export const listings: Listing[] = [
  {
    id: 'l1', deal: 'buy', type: 'Villa', title: 'Oceanfront villa with infinity pool',
    address: 'Seven Mile Beach Rd 12', city: 'Grand Cayman', country: 'Cayman Islands',
    price: 1850000, beds: 5, baths: 5, areaM2: 410, plotM2: 1200, yearBuilt: 2019, isNew: true,
    openHouse: 'Sat 11:00 - 13:00',
    description: 'Wake up to open water views. This villa has a private pool, a chef kitchen and direct beach access. Hurricane-rated windows and a backup generator are included.',
    features: ['Infinity pool', 'Beach access', 'Generator', 'Smart home', 'Double garage'],
    hue: 190, lat: 22, lng: 30, agent,
  },
  {
    id: 'l2', deal: 'buy', type: 'House', title: 'Colonial family home near the Palmentuin',
    address: 'Gravenstraat 48', city: 'Paramaribo', country: 'Suriname',
    price: 285000, beds: 4, baths: 2, areaM2: 190, plotM2: 450, yearBuilt: 1952, isNew: false,
    description: 'A restored wooden house in the historic center. High ceilings, a covered veranda and a mature garden with fruit trees.',
    features: ['Veranda', 'Garden', 'Restored woodwork', 'Solar panels'],
    hue: 28, lat: 62, lng: 58, agent,
  },
  {
    id: 'l3', deal: 'rent', type: 'Apartment', title: 'Bright 2 bedroom apartment, city view',
    address: 'Kaya Flamboyan 7', city: 'Willemstad', country: 'Curaçao',
    price: 1450, beds: 2, baths: 1, areaM2: 88, yearBuilt: 2016, isNew: false,
    description: 'Furnished apartment ten minutes from the pontoon bridge. Shared rooftop pool, fast fiber internet and secure parking.',
    features: ['Furnished', 'Rooftop pool', 'Fiber internet', 'Parking'],
    hue: 340, lat: 48, lng: 44, agent,
  },
  {
    id: 'l4', deal: 'buy', type: 'Apartment', title: 'Penthouse with wraparound terrace',
    address: 'Bay Street 301', city: 'Nassau', country: 'Bahamas',
    price: 940000, beds: 3, baths: 3, areaM2: 245, yearBuilt: 2022, isNew: true,
    openHouse: 'Sun 14:00 - 16:00',
    description: 'Top floor corner unit with 360 degree views. Concierge, gym and a private elevator lobby.',
    features: ['Terrace', 'Concierge', 'Gym', 'Private elevator'],
    hue: 210, lat: 14, lng: 18, agent,
  },
  {
    id: 'l5', deal: 'buy', type: 'Land', title: 'Building plot on the Suriname River',
    address: 'Powakkaweg 5', city: 'Wanica', country: 'Suriname',
    price: 78000, beds: 0, baths: 0, areaM2: 0, plotM2: 1800, yearBuilt: 0, isNew: false,
    description: 'Flat, cleared plot with river frontage. Power and water at the road. Titled and ready to build.',
    features: ['River frontage', 'Titled', 'Power at road'],
    hue: 120, lat: 70, lng: 66, agent,
  },
  {
    id: 'l6', deal: 'rent', type: 'House', title: 'Modern 3 bedroom house with garden',
    address: 'Rooseveltweg 220', city: 'Paramaribo', country: 'Suriname',
    price: 1900, beds: 3, baths: 2, areaM2: 160, plotM2: 380, yearBuilt: 2018, isNew: false,
    description: 'Quiet street, solar water heating and air conditioning in every bedroom. Pets welcome.',
    features: ['Air conditioning', 'Solar water heating', 'Pet friendly', 'Carport'],
    hue: 160, lat: 60, lng: 52, agent,
  },
  {
    id: 'l7', deal: 'buy', type: 'House', title: 'Hillside home with sunset views',
    address: 'Rodney Bay Hill 9', city: 'Gros Islet', country: 'Saint Lucia',
    price: 620000, beds: 4, baths: 3, areaM2: 270, plotM2: 900, yearBuilt: 2014, isNew: false,
    description: 'Open plan living, a wide deck and a plunge pool. Five minutes to the marina.',
    features: ['Plunge pool', 'Deck', 'Marina nearby', 'Cistern'],
    hue: 15, lat: 36, lng: 80, agent,
  },
  {
    id: 'l8', deal: 'rent', type: 'Villa', title: 'Garden villa, long stay friendly',
    address: 'Pretty Bay 14', city: 'Bridgetown', country: 'Barbados',
    price: 3800, beds: 3, baths: 3, areaM2: 210, plotM2: 700, yearBuilt: 2011, isNew: false,
    description: 'Walk to the beach. Furnished with a tropical garden, outdoor kitchen and a small pool.',
    features: ['Furnished', 'Small pool', 'Outdoor kitchen', 'Walk to beach'],
    hue: 95, lat: 40, lng: 88, agent,
  },
  {
    id: 'l9', deal: 'buy', type: 'Commercial', title: 'Corner retail unit, high foot traffic',
    address: 'Domineestraat 33', city: 'Paramaribo', country: 'Suriname',
    price: 410000, beds: 0, baths: 1, areaM2: 140, yearBuilt: 2005, isNew: false,
    description: 'Ground floor shop with storage and a rear loading door. Tenant in place, 8 percent yield.',
    features: ['Tenant in place', 'Loading door', 'Corner position'],
    hue: 260, lat: 63, lng: 60, agent,
  },
  {
    id: 'l10', deal: 'buy', type: 'Apartment', title: 'New build 1 bedroom near the marina',
    address: 'Harbour Dr 2', city: 'Kingston', country: 'Jamaica',
    price: 215000, beds: 1, baths: 1, areaM2: 64, yearBuilt: 2025, isNew: true,
    description: 'Energy efficient new build with a balcony and a shared courtyard. Completion in spring.',
    features: ['New build', 'Balcony', 'Courtyard', 'Energy label A'],
    hue: 300, lat: 20, lng: 48, agent,
  },
  {
    id: 'l11', deal: 'rent', type: 'Apartment', title: 'Studio near the university',
    address: 'Leysweg 60', city: 'Paramaribo', country: 'Suriname',
    price: 520, beds: 1, baths: 1, areaM2: 38, yearBuilt: 2020, isNew: false,
    description: 'Compact studio with kitchenette, air conditioning and included utilities.',
    features: ['Utilities included', 'Air conditioning', 'Kitchenette'],
    hue: 50, lat: 61, lng: 55, agent,
  },
  {
    id: 'l12', deal: 'buy', type: 'Villa', title: 'Gated villa with guest cottage',
    address: 'Palm Grove 21', city: 'Punta Cana', country: 'Dominican Republic',
    price: 735000, beds: 4, baths: 4, areaM2: 330, plotM2: 1000, yearBuilt: 2021, isNew: false,
    description: 'Inside a golf community. Main house plus a one bedroom guest cottage. Pool, gazebo and 24/7 security.',
    features: ['Gated', 'Guest cottage', 'Pool', 'Golf community'],
    hue: 175, lat: 26, lng: 62, agent,
  },
];

/** Find one listing by id. */
export const getListing = (id: string): Listing | undefined =>
  listings.find((l) => l.id === id);

/** Popular searches shown on the home page. */
export const popularPlaces = [
  { city: 'Paramaribo', country: 'Suriname', hue: 28 },
  { city: 'Grand Cayman', country: 'Cayman Islands', hue: 190 },
  { city: 'Nassau', country: 'Bahamas', hue: 210 },
  { city: 'Willemstad', country: 'Curaçao', hue: 340 },
  { city: 'Bridgetown', country: 'Barbados', hue: 95 },
  { city: 'Punta Cana', country: 'Dominican Republic', hue: 175 },
];
