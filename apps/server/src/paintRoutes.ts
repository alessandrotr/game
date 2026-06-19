import type { Express, Request, Response } from 'express';
import { sanitizePaint } from '@arena/shared';
import { getPool } from './db/database.js';
import { getPaint, savePaint } from './db/paint.js';
import { verifyToken } from './auth.js';

/**
 * Per-account character paint routes. Two authed self routes (GET/PUT, mirroring
 * /cosmetics) plus a PUBLIC read by account id so peers can fetch and display
 * another player's paint — the PNG overlays are too large for the realtime
 * schema, so the schema only carries a `pid` + `paintRev` and clients pull the
 * pixels over HTTP here. Paint is purely cosmetic, so public read is acceptable.
 */
export function registerPaintRoutes(app: Express): void {
  app.get('/paint', (req, res) => void getSelf(req, res));
  app.put('/paint', (req, res) => void putSelf(req, res));
  app.get('/paint/:pid', (req, res) => void getPublic(req, res));
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function getSelf(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  if (claims.pid === undefined) {
    res.json({}); // guest — no persisted paint, defaults applied client-side
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  try {
    res.json(await getPaint(db, claims.pid));
  } catch (err) {
    console.error('[paint] load failed:', err);
    res.status(500).json({ error: 'Failed to load paint.' });
  }
}

async function putSelf(req: Request, res: Response): Promise<void> {
  const claims = verifyToken(bearer(req));
  if (!claims) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return;
  }
  // Guests have no account row — accept + echo a sanitized state without saving.
  if (claims.pid === undefined) {
    res.json(sanitizePaint(req.body));
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Accounts are unavailable (no database configured).' });
    return;
  }
  try {
    res.json(await savePaint(db, claims.pid, req.body));
  } catch (err) {
    console.error('[paint] save failed:', err);
    res.status(500).json({ error: 'Failed to save paint.' });
  }
}

/** Public: another player's paint, by account id (from the replicated Player.pid). */
async function getPublic(req: Request, res: Response): Promise<void> {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    res.status(400).json({ error: 'Bad player id.' });
    return;
  }
  const db = getPool();
  if (!db) {
    res.json({}); // no persistence — peers simply render the default look
    return;
  }
  try {
    res.json(await getPaint(db, pid));
  } catch (err) {
    console.error('[paint] public load failed:', err);
    res.status(500).json({ error: 'Failed to load paint.' });
  }
}
