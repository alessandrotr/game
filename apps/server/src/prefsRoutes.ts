import type { Express, Request, Response } from 'express';
import { DEFAULT_CAMERA_PREFS } from '@arena/shared';
import { getPool } from './db/database.js';
import { getCameraPrefs, saveCameraPrefs, sanitizeCameraPrefs } from './db/prefs.js';
import { verifyToken } from './auth.js';

/**
 * Authenticated per-account preference routes. Mirrors the auth-route
 * conventions: Bearer token → account id, 401 when the token is missing/expired,
 * 503 when persistence is disabled (no database).
 */
export function registerPrefsRoutes(app: Express): void {
  app.get('/prefs/camera', (req, res) => void getCamera(req, res));
  app.put('/prefs/camera', (req, res) => void putCamera(req, res));
}

/** Extract a Bearer token from the Authorization header. */
function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function getCamera(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  // Camera prefs live on the account row; a guest (no account id) gets defaults.
  if (claims.pid === undefined) {
    res.json({ ...DEFAULT_CAMERA_PREFS });
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  try {
    res.json(await getCameraPrefs(db, claims.pid));
  } catch (err) {
    console.error('[prefs] camera load failed:', err);
    res.status(500).json({ error: 'Failed to load preferences.' });
  }
}

async function putCamera(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  const prefs = sanitizeCameraPrefs(req.body);
  // Guests have no account row to persist to — accept and echo without saving.
  if (claims.pid === undefined) {
    res.json(prefs);
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  try {
    await saveCameraPrefs(db, claims.pid, prefs);
    res.json(prefs); // echo the stored (sanitized) prefs
  } catch (err) {
    console.error('[prefs] camera save failed:', err);
    res.status(500).json({ error: 'Failed to save preferences.' });
  }
}
