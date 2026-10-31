import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Resource } from 'sst';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { assertNotRevoked } from '../lib/applications';
import { RestUtil } from '../utils/RestUtil';

const s3 = new S3Client({});

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image

const Body = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) });

/**
 * POST /uploads/presign
 * Returns a presigned POST. S3 enforces content type and size, so a client
 * cannot upload anything larger or of another type. Keys are scoped per user.
 */
export const handler = RestUtil.restHandler(async (event) => {
  const sub = RestUtil.getSub(event);
  // Only agents and admins publish listings, so only they may upload photos. A revoked agent is blocked at once.
  const groups = RestUtil.getGroups(event);
  if (!groups.some((g) => g === 'Agent' || g === 'Admin')) throw new AppError('Agent access needed to upload photos', 403);
  await assertNotRevoked(sub, groups);
  const parsed = Body.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) throw new AppError('contentType must be jpeg, png or webp', 400);

  const { contentType } = parsed.data;
  const key = `listings/${sub}/${randomUUID()}.${EXT[contentType]}`;

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: Resource.Images.name,
    Key: key,
    Conditions: [
      ['content-length-range', 1, MAX_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Fields: { 'Content-Type': contentType },
    Expires: 300,
  });

  // Store `key` on the listing. The web app builds the CDN URL from it.
  return { url, fields, key };
});
