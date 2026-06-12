import { DEFAULT_CAMERA_PREFS, type CameraPrefs } from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Per-account UI preferences (camera locks). Stored as a JSONB blob on the
 * `players` row so adding more prefs later doesn't need a migration. Pure over
 * {@link Queryable}, mirroring the `players` repository.
 */

/** Coerce untrusted input (request body, or a DB row that may be a JSON string
 *  or an already-parsed object) into a clean {@link CameraPrefs}. */
export function sanitizeCameraPrefs(raw: unknown): CameraPrefs {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  return {
    lockTiltUp: Boolean(obj.lockTiltUp),
    lockTiltDown: Boolean(obj.lockTiltDown),
    lockRotation: Boolean(obj.lockRotation),
    lockZoom: Boolean(obj.lockZoom),
  };
}

/** Read an account's camera prefs (defaults when unset). */
export async function getCameraPrefs(db: Queryable, playerId: number): Promise<CameraPrefs> {
  const { rows } = await db.query('SELECT camera_prefs FROM players WHERE id = $1', [playerId]);
  const raw = rows[0]?.camera_prefs;
  return raw == null ? { ...DEFAULT_CAMERA_PREFS } : sanitizeCameraPrefs(raw);
}

/** Persist an account's camera prefs (sanitized). */
export async function saveCameraPrefs(
  db: Queryable,
  playerId: number,
  prefs: CameraPrefs,
): Promise<void> {
  const clean = sanitizeCameraPrefs(prefs);
  await db.query('UPDATE players SET camera_prefs = $2::jsonb WHERE id = $1', [
    playerId,
    JSON.stringify(clean),
  ]);
}
