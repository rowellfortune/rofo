/** Lowercase, dash-separated slug used inside keys so "Grand Cayman" and "grand cayman" match. */
export const slug = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Primary key for a listing item. */
export const listingKey = (id: string) => ({ pk: `LISTING#${id}`, sk: 'META' });

/** Primary key for a favorite item. */
export const favoriteKey = (userId: string, listingId: string) => ({
  pk: `USER#${userId}`,
  sk: `FAV#${listingId}`,
});

/** Index keys for a listing. Rewrite these whenever deal, city, country or agent changes. */
export function listingIndexKeys(l: {
  id: string; deal: string; city: string; country: string; agentId: string; createdAt: string;
}) {
  const stamp = `${l.createdAt}#${l.id}`;
  return {
    gsi1pk: `PLACE#${slug(l.country)}#${slug(l.city)}`,
    gsi1sk: `${l.deal}#${stamp}`,
    gsi2pk: `DEAL#${l.deal}`,
    gsi2sk: stamp,
    gsi3pk: `AGENT#${l.agentId}`,
    gsi3sk: stamp,
  };
}

/** Strip table keys before returning an item to GraphQL. */
export function stripKeys<T extends Record<string, unknown>>(item: T) {
  const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, entity, ...rest } = item as Record<string, unknown>;
  void pk; void sk; void gsi1pk; void gsi1sk; void gsi2pk; void gsi2sk; void gsi3pk; void gsi3sk; void entity;
  return rest;
}
