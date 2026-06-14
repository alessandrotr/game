import type { Express, Request, Response } from 'express';
import { sanitizeState } from '@arena/shared';
import { getPool } from './db/database.js';
import { getCosmetics, saveCosmetics } from './db/cosmetics.js';
import { verifyToken } from './auth.js';

/**
 * Authenticated per-account cosmetics routes. Mirrors the prefs-route
 * conventions: Bearer token → account id, 401 when missing/expired, 503 when
 * persistence is disabled. The payload is the **per-class** cosmetics state
 * (class → owned ids + equipped loadout); the server re-sanitizes it so a
 * character can never own/equip something invalid. An empty `{}` means "no
 * characters customized yet" — the client fills in per-class defaults.
 */
export function registerCosmeticsRoutes(app: Express): void {
  app.get('/cosmetics', (req, res) => void getAll(req, res));
  app.put('/cosmetics', (req, res) => void putAll(req, res));
}

/** Extract a Bearer token from the Authorization header. */
function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function getAll(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  if (claims.pid === undefined) {
    res.json({}); // guest — defaults are applied client-side per class
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  try {
    res.json(await getCosmetics(db, claims.pid));
  } catch (err) {
    console.error('[cosmetics] load failed:', err);
    res.status(500).json({ error: 'Failed to load cosmetics.' });
  }
}

async function putAll(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  // Guests have no account row — accept and echo a sanitized state without saving.
  if (claims.pid === undefined) {
    res.json(sanitizeState(req.body));
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  try {
    res.json(await saveCosmetics(db, claims.pid, req.body));
  } catch (err) {
    console.error('[cosmetics] save failed:', err);
    res.status(500).json({ error: 'Failed to save cosmetics.' });
  }
}
