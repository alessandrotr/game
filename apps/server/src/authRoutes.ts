import type { Express, Request, Response } from 'express';
import type { AuthResult } from '@arena/shared';
import { getPool } from './db/database.js';
import { captureServerError } from './observability.js';
import {
  allProgress,
  createAccount,
  EmailTakenError,
  findByEmail,
  touchLastSeen,
} from './db/players.js';
import {
  cleanUsername,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  PASSWORD_MIN,
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
  app.get('/auth/me', (req, res) => void me(req, res));
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
    captureServerError(err, { message: '[auth] register failed:', tags: { where: 'auth.register' } });
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
    res.json(result(acc.id, acc.username, progress));
  } catch (err) {
    captureServerError(err, { message: '[auth] login failed:', tags: { where: 'auth.login' } });
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
  const progress = db ? await allProgress(db, claims.pid).catch(() => []) : [];
  res.json(result(claims.pid, claims.name, progress));
}

/** Build the standard auth response (issues a fresh token). */
function result(pid: number, username: string, progress: AuthResult['progress']): AuthResult {
  return { token: signToken(pid, username), username, progress };
}

/** Extract a Bearer token from the Authorization header. */
function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
