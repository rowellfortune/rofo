/**
 * Seed the dev table with the sample listings from the frontend mock data.
 * Run:  npx sst shell --stage dev -- npx tsx backend/scripts/seed.ts
 */
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { listings } from '../../src/data/listings';
import { ddb, TABLE } from '../lib/db';
import { listingIndexKeys, listingKey } from '../lib/keys';

const SEED_AGENT = 'seed-agent';

async function main() {
  const base = Date.now();
  for (const [i, l] of listings.entries()) {
    const createdAt = new Date(base - i * 3_600_000).toISOString(); // spread over hours
    const id = crypto.randomUUID();
    const { id: _mockId, hue: _hue, agent, lat: _lat, lng: _lng, ...rest } = l;
    void [_mockId, _hue, _lat, _lng];
    const item = {
      ...rest,
      id,
      plotM2: l.plotM2 ?? null,
      yearBuilt: l.yearBuilt || null,
      openHouse: l.openHouse ?? null,
      images: [],
      agentId: SEED_AGENT,
      agentName: agent.name,
      agency: agent.agency,
      phone: agent.phone,
      createdAt,
      updatedAt: createdAt,
    };
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { ...listingKey(id), ...listingIndexKeys(item), entity: 'LISTING', ...item },
    }));
  }
  console.log(`Seeded ${listings.length} listings`);
}
main();
