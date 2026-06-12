/**
 * Client-predicted dash (warrior charge / archer tumble). The server applies the
 * same forced displacement; predicting it locally keeps the dash smooth instead
 * of the client running toward a stale destination while the server slides it —
 * which otherwise fights the prediction and hard-snaps. Mirrors the server's
 * `displace` (constant-velocity slide for `distance / speed` seconds). Plain
 * mutable singleton, read each frame by the local player's predictor.
 */
interface LocalDash {
  active: boolean;
  vx: number;
  vz: number;
  dirX: number;
  dirZ: number;
  /** `performance.now()` ms at which the dash ends. */
  until: number;
}

const dash: LocalDash = { active: false, vx: 0, vz: 0, dirX: 0, dirZ: 1, until: 0 };

/** Begin a predicted dash along (dirX, dirZ) for `distance` units at `speed`. */
export function setLocalDash(dirX: number, dirZ: number, distance: number, speed: number): void {
  if (speed <= 0 || distance <= 0) return;
  const len = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / len;
  const nz = dirZ / len;
  dash.dirX = nx;
  dash.dirZ = nz;
  dash.vx = nx * speed;
  dash.vz = nz * speed;
  dash.until = performance.now() + (distance / speed) * 1000;
  dash.active = true;
}

export function getLocalDash(): Readonly<LocalDash> {
  return dash;
}

export function clearLocalDash(): void {
  dash.active = false;
}
