import { randomUUID } from 'node:crypto';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import type { Caller } from '../utils/GraphqlUtil';
import { ddb, TABLE } from './db';
import { stripKeys } from './keys';
import { loadListing } from './listings';

const InquiryInput = z.object({
  listingId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(200),
  message: z.string().trim().min(5).max(2000),
});

/** Save an inquiry under the listing. Agents read them with listingInquiries. */
export async function sendInquiry(caller: Caller, raw: unknown) {
  const r = InquiryInput.safeParse(raw);
  if (!r.success) throw new AppError(r.error.issues.map((i) => i.message).join('; '), 400);
  await loadListing(r.data.listingId);

  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const item = { ...r.data, id, userId: caller.sub, createdAt };
  await ddb.send(new PutCommand({
    TableName: TABLE(),
    Item: { pk: `LISTING#${r.data.listingId}`, sk: `INQ#${createdAt}#${id}`, entity: 'INQUIRY', ...item },
  }));
  return item;
}

/** Inquiries for one listing. Owner or Admin only. */
export async function listingInquiries(caller: Caller, listingId: string) {
  const listing = await loadListing(listingId);
  if (listing.agentId !== caller.sub && !caller.groups.includes('Admin')) throw new AppError('Not allowed', 403);
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :inq)',
    ExpressionAttributeValues: { ':pk': `LISTING#${listingId}`, ':inq': 'INQ#' },
    ScanIndexForward: false,
    Limit: 100,
  }));
  return (res.Items ?? []).map(stripKeys);
}
