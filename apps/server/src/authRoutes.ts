import type { Express, Request, Response } from 'express';
import type { AuthResult, CosmeticsState } from '@arena/shared';
import { getPool } from './db/database.js';
import { getCosmetics } from './db/cosmetics.js';
import { captureServerError } from './observability.js';
import {
  allProgress,
  createAccount,
  EmailTakenError,
  ensureGuestAccount,
  findByEmail,
  findGuestId,
  touchLastSeen,
  upgradeGuest,
} from './db/players.js';
import {
  cleanUsername,
  hashPassword,
  isValidEmail,
  newGuestId,
  normalizeEmail,
  PASSWORD_MIN,
  randomGuestName,
  signGuestToken,
  signToken,
  verifyPassword,
  verifyToken,
} from './auth.js';

/**
 * HTTP authentication routes (email + password accounts). Registration/login
 * return a signed session token plus the account's per-class progress, which the
 * client passes to game rooms on join and uses to show levels on class select.
 */
export function registerAuthRoutes(app: Express): void {
  app.post('/auth/register', (req, res) => void register(req, res));
  app.post('/auth/login', (req, res) => void login(req, res));
  app.post('/auth/guest', (req, res) => guest(req, res));
  app.patch('/auth/upgrade', (req, res) => void upgrade(req, res));
  app.get('/auth/me', (req, res) => void me(req, res));
}

/**
 * Start a guest session. Issues a signed guest token immediately but writes
 * nothing to the database — the `players` row is created lazily on the guest's
 * first match (so idle visitors never create rows). Registration later upgrades
 * that same row in place, keeping any progress earned as a guest.
 */
function guest(_req: Request, res: Response): void {
  const name = randomGuestName();
  res.status(201).json({
    token: signGuestToken(newGuestId(), name),
    username: name,
    progress: [],
    cosmetics: DEFAULT_COSMETICS,
    guest: true,
  });
}

/**
 * Upgrade the current guest session into a full account: attach email/username/
 * password to the guest's (possibly not-yet-created) row, keeping its id and all
 * progress. Requires a valid guest token; a registered account token is rejected.
 */
async function upgrade(req: Request, res: Response): Promise<void> {
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  if (!claims.guest || !claims.gid) {
    res.status(409).json({ error: 'This session is already a registered account.' });
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const username = cleanUsername(req.body?.username);
  const password = String(req.body?.password ?? '');
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  if (!username) {
    res.status(400).json({ error: 'Display name must be 2–24 characters.' });
    return;
  }
  if (password.length < PASSWORD_MIN) {
    res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
    return;
  }

  try {
    const pid = await ensureGuestAccount(db, claims.gid, claims.name);
    const acc = await upgradeGuest(db, pid, email, username, hashPassword(password));
    const progress = await allProgress(db, acc.id).catch(() => []);
    const cosmetics = await getCosmetics(db, acc.id).catch(() => DEFAULT_COSMETICS);
    res.json(result(acc.id, acc.username, progress, cosmetics));
  } catch (err) {
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: 'That email is already registered.' });
      return;
    }
    captureServerError(err, {
      message: '[auth] guest upgrade failed:',
      tags: { where: 'auth.upgrade' },
      user: { email, username, ip_address: req.ip },
    });
    res.status(500).json({ error: 'Could not create your account. Try again.' });
  }
}

async function register(req: Request, res: Response): Promise<void> {
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  const email = normalizeEmail(req.body?.email);
  const username = cleanUsername(req.body?.username);
  const password = String(req.body?.password ?? '');

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  if (!username) {
    res.status(400).json({ error: 'Display name must be 2–24 characters.' });
    return;
  }
  if (password.length < PASSWORD_MIN) {
    res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
    return;
  }

  try {
    const acc = await createAccount(db, email, username, hashPassword(password));
    res.status(201).json(result(acc.id, acc.username, []));
  } catch (err) {
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: 'That email is already registered.' });
      return;
    }
    captureServerError(err, {
      message: '[auth] register failed:',
      tags: { where: 'auth.register' },
      // No account yet — attach what identifies the attempt: email + client IP.
      user: { email, username, ip_address: req.ip },
    });
    res.status(500).json({ error: 'Registration failed. Try again.' });
  }
}

async function login(req: Request, res: Response): Promise<void> {
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');

  try {
    const acc = await findByEmail(db, email);
    if (!acc || !verifyPassword(password, acc.passwordHash)) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    await touchLastSeen(db, acc.id).catch(() => {});
    const progress = await allProgress(db, acc.id);
    const cosmetics = await getCosmetics(db, acc.id).catch(() => DEFAULT_COSMETICS);
    res.json(result(acc.id, acc.username, progress, cosmetics));
  } catch (err) {
    captureServerError(err, {
      message: '[auth] login failed:',
      tags: { where: 'auth.login' },
      // No verified account on a failed login — attach the attempted email + IP.
      user: { email, ip_address: req.ip },
    });
    res.status(500).json({ error: 'Login failed. Try again.' });
  }
}

async function me(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  const db = getPool();
  if (claims.guest && claims.gid) {
    // Resume a guest session: look up their row read-only (it exists only if
    // they've played a match) so we can replay any earned progress.
    const pid = db ? await findGuestId(db, claims.gid).catch(() => null) : null;
    const progress = pid !== null && db ? await allProgress(db, pid).catch(() => []) : [];
    const cosmetics = pid !== null && db ? await getCosmetics(db, pid).catch(() => DEFAULT_COSMETICS) : DEFAULT_COSMETICS;
    res.json({
      token: signGuestToken(claims.gid, claims.name),
      username: claims.name,
      progress,
      cosmetics,
      guest: true,
    });
    return;
  }
  const progress = db && claims.pid !== undefined ? await allProgress(db, claims.pid).catch(() => []) : [];
  const cosmetics =
    db && claims.pid !== undefined
      ? await getCosmetics(db, claims.pid).catch(() => DEFAULT_COSMETICS)
      : DEFAULT_COSMETICS;
  res.json(result(claims.pid!, claims.name, progress, cosmetics));
}

/** A fresh account's cosmetics: no characters customized yet (client fills in
 *  per-class defaults). */
const DEFAULT_COSMETICS: CosmeticsState = {};

/** Build the standard auth response (issues a fresh account token). */
function result(
  pid: number,
  username: string,
  progress: AuthResult['progress'],
  cosmetics: CosmeticsState = DEFAULT_COSMETICS,
): AuthResult {
  return { token: signToken(pid, username), username, progress, cosmetics, guest: false };
}

/** Extract a Bearer token from the Authorization header. */
function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
