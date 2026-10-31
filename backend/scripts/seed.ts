/**
 * Seed the DEV table with the sample listings from the frontend mock data.
 * Run:  npm run seed          (same as: npx sst shell --stage dev -- tsx backend/scripts/seed.ts)
 * Refuses to run on the production stage, because these are fake listings.
 */
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
import { listings } from '../../src/data/listings';
import { ddb, TABLE } from '../lib/db';
import { listingIndexKeys, listingKey } from '../lib/keys';

const SEED_AGENT = 'seed-agent';

async function main() {
  if (Resource.App.stage === 'production') {
    throw new Error('Refusing to seed the production stage. These are fake listings.');
  }
  const base = Date.now();
  for (const [i, l] of listings.entries()) {
    const createdAt = new Date(base - i * 3_600_000).toISOString(); // spread over hours
    const id = crypto.randomUUID();
    const { id: _mockId, hue: _hue, agent, ...rest } = l; // keeps lat and lng so seeded homes show on the map
    void [_mockId, _hue];
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
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
