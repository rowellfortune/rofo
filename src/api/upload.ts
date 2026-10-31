import { apiConfig } from './config';
import { ApiError, getAuth } from './transport';

/** Allowed types and size. S3 enforces the same limits again on the server side. */
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_BYTES = 8 * 1024 * 1024;

/** Client checks so people get an instant message. Returns an error text or null. */
export function checkImage(file: { type: string; size: number; name: string }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return `${file.name}: use JPEG, PNG or WebP`;
  if (file.size > MAX_BYTES) return `${file.name}: larger than 8 MB`;
  if (file.size === 0) return `${file.name}: empty file`;
  return null;
}

/** Things we replace in tests. */
export interface UploadDeps {
  fetch: typeof fetch;
  getToken: () => Promise<string>;
  restUrl: string;
}

const defaultDeps = (): UploadDeps => ({
  fetch: (...a) => fetch(...a),
  restUrl: apiConfig.restUrl,
  getToken: async () => {
    const session = await (await getAuth()).fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new ApiError('Sign in required');
    return token;
  },
});

/**
 * Upload one image to S3 and return its key.
 * Step 1: ask the REST API for a presigned POST (it locks type and size).
 * Step 2: POST the file straight to S3. The file field must come last.
 */
export async function uploadImage(file: File, deps: UploadDeps = defaultDeps()): Promise<string> {
  const problem = checkImage(file);
  if (problem) throw new ApiError(problem);
  if (!deps.restUrl) throw new ApiError('Uploads are not configured (VITE_REST_URL)');

  const presign = await deps.fetch(`${deps.restUrl}/uploads/presign`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await deps.getToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type }),
  });
  const json = (await presign.json()) as { success: boolean; error?: string; data?: { url: string; fields: Record<string, string>; key: string } };
  if (!json.success || !json.data) throw new ApiError(json.error ?? 'Could not start the upload');

  const form = new FormData();
  Object.entries(json.data.fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file); // must be last
  const up = await deps.fetch(json.data.url, { method: 'POST', body: form });
  if (!up.ok) throw new ApiError(`Upload failed (${up.status})`);
  return json.data.key;
}
