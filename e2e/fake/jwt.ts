/** Minimal HS256 JWTs for the fake user pool. Amplify only decodes them; the fake AppSync verifies them. */
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = 'rofo-e2e-only-secret';
const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');

export function sign(claims: Record<string, unknown>): string {
  const head = `${b64({ alg: 'HS256', typ: 'JWT', kid: 'e2e' })}.${b64(claims)}`;
  return `${head}.${b64(createHmac('sha256', SECRET).update(head).digest())}`;
}

/** The claims, or null when the signature is wrong or the token has expired. */
export function verify(token: string): Record<string, any> | null {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const want = createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
  return claims;
}
