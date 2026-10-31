import type { Listing, Pool } from '../types';
import { apiConfig } from './config';

/** Shapes returned by the GraphQL API. */
export interface ApiListing {
  id: string; deal: 'buy' | 'rent'; type: Listing['type']; title: string; address: string; city: string;
  country: string; price: number; beds: number; baths: number; areaM2: number; plotM2?: number | null;
  yearBuilt?: number | null; isNew: boolean; openHouse?: string | null; description: string;
  features: string[]; images: string[]; lat?: number | null; lng?: number | null; suspended?: boolean | null;
  agentId: string; agentName: string; agency: string; phone: string; createdAt: string;
}

export interface ApiPool {
  id: string; name: string; listingId: string; listingPrice: number; goal: number; raised: number;
  maxMembers: number; memberCount: number; targetMonths: number; status: string; creatorId: string;
  createdAt: string; viewerIsMember?: boolean | null;
  members: { userId: string; name: string; monthly: number; contributed: number; sharePct: number; joinedAt: string }[];
  ledger: {
    id: string; userId: string; amount: number; note: string; createdAt: string;
    reference?: string | null; reversedAt?: string | null; reversalOf?: string | null;
  }[];
  proposals: {
    id: string; title: string; detail: string; createdBy: string; createdAt: string;
    yes: number; no: number; needed: number; status: string; myVote?: string | null;
  }[];
}

/** Stable hue from an id, so a listing keeps its illustration colors. */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** S3 key to CDN URL. Keys that are already URLs pass through. */
export const imageUrl = (key: string): string =>
  /^https?:\/\//.test(key) ? key : `${apiConfig.cdnUrl}/${key}`;

/** True when a listing has usable map coordinates. */
export const hasCoords = (l: { lat: number; lng: number }): boolean =>
  Number.isFinite(l.lat) && Number.isFinite(l.lng) && !(l.lat === 0 && l.lng === 0);

/** API listing to the app's Listing type. Missing coordinates become NaN and are skipped on maps. */
export function toListing(a: ApiListing): Listing {
  return {
    id: a.id, deal: a.deal, type: a.type, title: a.title, address: a.address, city: a.city, country: a.country,
    price: a.price, beds: a.beds, baths: a.baths, areaM2: a.areaM2, plotM2: a.plotM2 ?? undefined,
    yearBuilt: a.yearBuilt ?? 0, isNew: a.isNew, openHouse: a.openHouse ?? undefined,
    description: a.description, features: a.features, hue: hueFromId(a.id),
    lat: a.lat ?? NaN, lng: a.lng ?? NaN,
    agent: { name: a.agentName, agency: a.agency, phone: a.phone },
    images: a.images.map(imageUrl), imageKeys: a.images, suspended: Boolean(a.suspended), createdAt: a.createdAt,
  };
}

/** API pool to the app's Pool type. Summaries carry totals, full pools also carry members. */
export function toPool(a: ApiPool): Pool {
  return {
    id: a.id, name: a.name, listingId: a.listingId, maxMembers: a.maxMembers, targetMonths: a.targetMonths,
    createdAt: a.createdAt,
    members: a.members.map((m) => ({
      id: m.userId, name: m.name, monthly: m.monthly, contributed: m.contributed, joinedAt: m.joinedAt.slice(0, 10),
    })),
    ledger: a.ledger.map((e) => ({
      id: e.id, memberId: e.userId, amount: e.amount, date: e.createdAt.slice(0, 10), note: e.note,
      reference: e.reference ?? null, reversedAt: e.reversedAt ?? null, reversalOf: e.reversalOf ?? null,
    })),
    proposals: a.proposals.map((p) => ({
      id: p.id, title: p.title, detail: p.detail, votes: {},
      tally: {
        yes: p.yes, no: p.no, needed: p.needed,
        status: p.status === 'PASSED' || p.status === 'REJECTED' ? p.status : 'OPEN',
        myVote: p.myVote === 'yes' || p.myVote === 'no' ? p.myVote : null,
      },
    })),
    summary: { raised: a.raised, goal: a.goal, memberCount: a.memberCount, viewerIsMember: Boolean(a.viewerIsMember) },
  };
}
