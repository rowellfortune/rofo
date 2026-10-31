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
  lat: number; // latitude in degrees (approximate for the demo)
  lng: number; // longitude in degrees
  agent: { name: string; agency: string; phone: string };
  images?: string[]; // photo URLs from the API. Missing in demo mode.
  imageKeys?: string[]; // S3 keys behind `images`, needed when editing a listing
  suspended?: boolean; // hidden from the public (the agent was revoked). Only the owner and admins see it.
  createdAt?: string;
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

// ---------- Co-buying pools ----------

/** One member of a buying pool. */
export interface PoolMember {
  id: string;
  name: string;
  monthly: number; // agreed monthly contribution (USD)
  contributed: number; // total paid in so far (USD)
  joinedAt: string;
}

/** One line in the pool ledger. */
export interface LedgerEntry {
  id: string;
  memberId: string;
  amount: number; // negative for a reversal
  date: string;
  note: string;
  reference?: string | null; // escrow or bank reference
  reversedAt?: string | null; // set on a payment that was undone
  reversalOf?: string | null; // set on the entry that undoes another
}

/** A decision the group votes on. One member, one vote. */
export interface Proposal {
  id: string;
  title: string;
  detail: string;
  votes: Record<string, 'yes' | 'no'>; // memberId -> choice (demo mode)
  /** Server-computed result (API mode). Replaces `votes` when present. */
  tally?: { yes: number; no: number; needed: number; status: 'PASSED' | 'REJECTED' | 'OPEN'; myVote: 'yes' | 'no' | null };
}

/** A group of people saving together to buy one property. */
export interface Pool {
  id: string;
  name: string;
  listingId: string;
  maxMembers: number;
  targetMonths: number;
  createdAt: string;
  members: PoolMember[];
  ledger: LedgerEntry[];
  proposals: Proposal[];
  /** Server totals (API mode). Lists of members are private, so counts come from here. */
  summary?: { raised: number; goal: number; memberCount: number; viewerIsMember: boolean };
}

/** A message a buyer sent to an agent about a listing. */
export interface Inquiry {
  id: string;
  listingId: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

/** One place an address search can resolve to. */
export interface GeoCandidate {
  label: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
}

/** A request to become an agent. One per user. */
export interface AgentApplication {
  userId: string;
  email: string;
  name: string;
  agency: string;
  phone: string;
  registrationNo: string;
  country: string;
  website: string | null;
  about: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  reviewNote: string | null; // for a revoked agent this is the reason
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  /** Set when this applicant lost access before. Shown to whoever reviews the new application. */
  priorRevocationNote?: string | null;
  priorRevocationAt?: string | null;
  /** Only present on the response to a revoke. */
  listingsHidden?: number | null;
  listingsFailed?: number | null;
}
