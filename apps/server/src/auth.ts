import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Account authentication primitives (Phase: accounts). Passwords are hashed with
 * scrypt + a per-password salt; sessions are stateless HMAC-signed tokens. Uses
 * only `node:crypto` — no extra dependencies, so it builds cleanly on Alpine.
 */

/** Token lifetime: 30 days. */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

/** Signing secret. Set AUTH_SECRET in production; otherwise tokens are signed
 *  with a random per-boot key (so a restart logs everyone out — fine for dev). */
const SECRET = resolveSecret();

function resolveSecret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    console.warn('🔒  AUTH_SECRET is unset/weak — tokens will not survive a restart. Set it!');
  }
  return randomBytes(32).toString('hex');
}

// --- Passwords -------------------------------------------------------------

/** Hash a plaintext password as `saltHex:hashHex` (salted scrypt). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Verify a password against a stored `saltHex:hashHex`, in constant time. */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Session tokens --------------------------------------------------------

export interface TokenClaims {
  /** Account (player) id. Present for registered accounts; absent for guests who
   *  haven't been persisted yet (they carry {@link TokenClaims.gid} instead, and
   *  get a row lazily on their first match). */
  pid?: number;
  /** Guest identity — a random, unguessable id keyed to the (eventual) `players`
   *  row. Present (with `guest: true`) only for not-yet-registered guests. */
  gid?: string;
  /** Display name, embedded so rooms get an authoritative name without a DB hit. */
  name: string;
  /** True for a guest session (a temporary identity with no email/password). */
  guest: boolean;
}

/** Issue a signed session token carrying the account id + display name. */
export function signToken(pid: number, name: string): string {
  const payload = Buffer.from(JSON.stringify({ pid, name, exp: Date.now() + TOKEN_TTL_MS })).toString(
    'base64url',
  );
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Issue a signed session token for a guest. Keyed by a random guest id rather
 *  than an account id — the `players` row is created lazily on their first match
 *  ({@link signToken} takes over once they register). */
export function signGuestToken(gid: string, name: string): string {
  const payload = Buffer.from(
    JSON.stringify({ gid, name, guest: true, exp: Date.now() + TOKEN_TTL_MS }),
  ).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** A random, unguessable guest identifier (carried in the guest token). */
export function newGuestId(): string {
  return randomBytes(16).toString('hex');
}

/** A friendly throwaway display name like `Guest-7F3A`. */
export function randomGuestName(): string {
  return `Guest-${randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Verify a token's signature + expiry. Returns the claims, or null if invalid. */
export function verifyToken(token: string | undefined | null): TokenClaims | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      pid?: unknown;
      gid?: unknown;
      name?: unknown;
      guest?: unknown;
      exp?: unknown;
    };
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    const name = String(data.name ?? '');
    if (data.guest === true && typeof data.gid === 'string') {
      return { gid: data.gid, name, guest: true };
    }
    if (typeof data.pid === 'number') return { pid: data.pid, name, guest: false };
    return null;
  } catch {
    return null;
  }
}

// --- Validation ------------------------------------------------------------

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 24;
export const PASSWORD_MIN = 8;

/** Normalize an email for storage/lookup (trim + lowercase). */
export function normalizeEmail(email: unknown): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate + clean a display name, or return null if unusable. */
export function cleanUsername(name: unknown): string | null {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX) return null;
  return trimmed;
}
