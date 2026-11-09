/**
 * Server side of Cognito's SRP-6a password check, written to match Amplify's client
 * (node_modules/@aws-amplify/auth/.../utils/srp). The fake user pool knows each password,
 * so it derives the verifier on the fly. A wrong password produces a wrong signature, as in Cognito.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';

// The 3072-bit group from RFC 5054, the same constant Amplify uses.
const N = BigInt('0x' +
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
  'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
  '83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
  '15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7' +
  'ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C' +
  'BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF');
const g = 2n;

/** Even-length hex, with a leading 00 when the top bit is set (Java BigInteger style, as Amplify does). */
export function padHex(n: bigint): string {
  let h = n.toString(16);
  if (h.length % 2) h = `0${h}`;
  return /^[89a-f]/i.test(h) ? `00${h}` : h;
}
const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex').padStart(64, '0');
const hashHex = (hex: string) => sha256Hex(Buffer.from(hex, 'hex'));
const big = (hex: string) => BigInt(`0x${hex}`);

/** Modular exponentiation for bigint. */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

const k = big(hashHex(padHex(N) + padHex(g)));

/** One login attempt in progress: what the server remembers between the two Cognito calls. */
export interface SrpSession { b: bigint; B: bigint; salt: bigint; secretBlock: string; userId: string }

/** Step 1 (InitiateAuth): pick b, compute B = k*v + g^b. */
export function startSrp(poolName: string, userId: string, password: string): SrpSession {
  const salt = big(randomBytes(16).toString('hex'));
  const v = verifier(poolName, userId, password, salt);
  const b = big(randomBytes(128).toString('hex'));
  const B = (k * v + modPow(g, b, N)) % N;
  return { b, B, salt, secretBlock: randomBytes(64).toString('base64'), userId };
}

/** v = g^x, x = H(salt | H(pool + user + ":" + password)). */
function verifier(poolName: string, userId: string, password: string, salt: bigint): bigint {
  const x = big(hashHex(padHex(salt) + sha256Hex(`${poolName}${userId}:${password}`)));
  return modPow(g, x, N);
}

/**
 * Step 2 (RespondToAuthChallenge): recompute the signature the client must have produced
 * and compare. Only a client that knew the password gets the same S, so the same key.
 */
export function checkSrp(
  s: SrpSession, poolName: string, password: string, A_hex: string, timestamp: string, signature: string,
): boolean {
  const A = big(A_hex);
  if (A % N === 0n) return false;
  const u = big(hashHex(padHex(A) + padHex(s.B)));
  const v = verifier(poolName, s.userId, password, s.salt);
  const S = modPow((A * modPow(v, u, N)) % N, s.b, N);
  // HKDF-SHA256 with info "Caldera Derived Key" + 0x01, first 16 bytes.
  const prk = createHmac('sha256', Buffer.from(padHex(u), 'hex')).update(Buffer.from(padHex(S), 'hex')).digest();
  const hkdf = createHmac('sha256', prk).update(Buffer.concat([Buffer.from('Caldera Derived Key'), Buffer.from([1])])).digest().subarray(0, 16);
  const msg = Buffer.concat([Buffer.from(poolName), Buffer.from(s.userId), Buffer.from(s.secretBlock, 'base64'), Buffer.from(timestamp)]);
  const expected = createHmac('sha256', hkdf).update(msg).digest('base64');
  return expected === signature;
}

/** B and salt as Cognito sends them in the challenge. */
export const challengeHex = (s: SrpSession) => ({ SRP_B: s.B.toString(16), SALT: s.salt.toString(16) });
