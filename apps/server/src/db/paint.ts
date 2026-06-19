import { sanitizePaint, type PaintState } from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Per-account character paint repository: the per-class skin colors + painted
 * overlay PNGs, stored as one JSONB blob on the `players` row (`cosmetics_paint`).
 * Pure over {@link Queryable}; everything is re-sanitized (shape + size limits)
 * by the shared catalog so a client can't store a malformed or oversized blob.
 */

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Read an account's paint state (sanitized; '{}' when never customized). */
export async function getPaint(db: Queryable, playerId: number): Promise<PaintState> {
  const { rows } = await db.query('SELECT cosmetics_paint FROM players WHERE id = $1', [playerId]);
  return sanitizePaint(parseJson(rows[0]?.cosmetics_paint));
}

/** Persist an account's paint state (re-sanitized). Returns the stored state. */
export async function savePaint(db: Queryable, playerId: number, state: unknown): Promise<PaintState> {
  const clean = sanitizePaint(state);
  await db.query('UPDATE players SET cosmetics_paint = $2::jsonb WHERE id = $1', [
    playerId,
    JSON.stringify(clean),
  ]);
  return clean;
}
