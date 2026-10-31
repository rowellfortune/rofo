import type { Pool } from '../types';

/** Seed pools. Money figures are fictional. */
export const seedPools: Pool[] = [
  {
    id: 'p1', name: 'Wanica Families Home Fund', listingId: 'l5', maxMembers: 6, targetMonths: 18,
    createdAt: '2026-06-02T10:00:00.000Z',
    members: [
      { id: 'u1', name: 'Anita R.', monthly: 220, contributed: 2640, joinedAt: '2026-06-02' },
      { id: 'u2', name: 'Kevin S.', monthly: 220, contributed: 2420, joinedAt: '2026-06-09' },
      { id: 'u3', name: 'Priya D.', monthly: 180, contributed: 1980, joinedAt: '2026-06-14' },
      { id: 'u4', name: 'Marlon T.', monthly: 180, contributed: 1620, joinedAt: '2026-07-01' },
    ],
    ledger: [
      { id: 'e1', memberId: 'u1', amount: 220, date: '2026-10-01', note: 'October contribution' },
      { id: 'e2', memberId: 'u2', amount: 220, date: '2026-10-01', note: 'October contribution' },
      { id: 'e3', memberId: 'u3', amount: 180, date: '2026-10-02', note: 'October contribution' },
      { id: 'e4', memberId: 'u4', amount: 180, date: '2026-10-03', note: 'October contribution' },
    ],
    proposals: [
      { id: 'pr1', title: 'Hire a surveyor for the Powakkaweg plot', detail: 'Cost 450 USD, split by share. Needed before any offer.', votes: { u1: 'yes', u2: 'yes', u3: 'yes' } },
    ],
  },
  {
    id: 'p2', name: 'Kingston Starter Flat', listingId: 'l10', maxMembers: 4, targetMonths: 24,
    createdAt: '2026-08-12T09:00:00.000Z',
    members: [
      { id: 'u5', name: 'Danielle H.', monthly: 260, contributed: 1040, joinedAt: '2026-08-12' },
      { id: 'u6', name: 'Rohan B.', monthly: 240, contributed: 960, joinedAt: '2026-08-20' },
    ],
    ledger: [
      { id: 'e5', memberId: 'u5', amount: 260, date: '2026-10-01', note: 'October contribution' },
      { id: 'e6', memberId: 'u6', amount: 240, date: '2026-10-02', note: 'October contribution' },
    ],
    proposals: [],
  },
  {
    id: 'p3', name: 'Paramaribo Heritage House', listingId: 'l2', maxMembers: 5, targetMonths: 30,
    createdAt: '2026-03-05T09:00:00.000Z',
    members: [
      { id: 'u7', name: 'Sunita K.', monthly: 300, contributed: 7500, joinedAt: '2026-03-05' },
      { id: 'u8', name: 'Edwin M.', monthly: 300, contributed: 7200, joinedAt: '2026-03-07' },
      { id: 'u9', name: 'Grace L.', monthly: 250, contributed: 6000, joinedAt: '2026-03-19' },
      { id: 'u10', name: 'Rishi P.', monthly: 250, contributed: 5750, joinedAt: '2026-04-02' },
      { id: 'u11', name: 'Naomi V.', monthly: 200, contributed: 4300, joinedAt: '2026-04-20' },
    ],
    ledger: [
      { id: 'e7', memberId: 'u7', amount: 300, date: '2026-10-01', note: 'October contribution' },
      { id: 'e8', memberId: 'u8', amount: 300, date: '2026-10-01', note: 'October contribution' },
    ],
    proposals: [
      { id: 'pr2', title: 'Make an offer of 270,000 USD on Gravenstraat 48', detail: 'Asking price is 285,000. The group has passed the deposit goal.', votes: { u7: 'yes', u8: 'yes', u9: 'no' } },
    ],
  },
];
