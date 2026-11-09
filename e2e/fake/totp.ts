/** RFC 6238 one time codes (SHA-1, 30 s, 6 digits), as authenticator apps make them. Used by the fake pool and by tests. */
import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A random base32 secret, the format Cognito's AssociateSoftwareToken returns. */
export function newSecret(): string {
  return [...randomBytes(20)].map((b) => ALPHABET[b % 32]).join('');
}

function base32ToBytes(secret: string): Buffer {
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += ALPHABET.indexOf(c).toString(2).padStart(5, '0');
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

/** The code an authenticator app shows for this secret at this time. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', base32ToBytes(secret)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const n = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** Accept the current code and one step either side, like Cognito tolerates clock drift. */
export const checkTotp = (secret: string, code: string, at = Date.now()) =>
  [-30_000, 0, 30_000].some((d) => totp(secret, at + d) === code);
