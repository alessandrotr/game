/**
 * Snapshot interpolation buffer for REMOTE players (Phase: LoL movement).
 *
 * The server streams transforms at ~20 Hz. Rendering remote players by easing
 * toward the *latest* snapshot looks rubbery (variable speed, pops on arrival).
 * Instead we keep a short timeline of timestamped transforms and render each
 * remote entity slightly in the past (`INTERP_DELAY_MS`), linearly interpolating
 * between the two snapshots that bracket that render time → constant-velocity,
 * jitter-free motion (the standard real-time-multiplayer technique).
 *
 * Plain mutable singleton (no React state); fed from the network layer, read in
 * `useFrame`. Times use `performance.now()` on both ends for a consistent clock.
 */

/** How far in the past to render players, in ms — the interpolation cushion. The
 *  server streams at ~20Hz (50ms); on a real (jittery) connection updates bunch up
 *  and gap, so the cushion must comfortably exceed one interval or playback "runs
 *  dry" and stutters. ~130ms ≈ 2.6 updates of headroom — smooth over typical
 *  internet jitter at the cost of a little display delay. Tunable. */
export const INTERP_DELAY_MS = 130;

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
}

const MAX_SAMPLES = 12;
const buffers = new Map<string, Sample[]>();

export interface NetTransform {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

/** Append the latest transforms (one timeline per player) and drop departed ones. */
export function recordSnapshots(
  players: Iterable<readonly [string, NetTransform]>,
  now: number,
): void {
  const seen = new Set<string>();
  for (const [id, p] of players) {
    seen.add(id);
    let buf = buffers.get(id);
    if (!buf) {
      buf = [];
      buffers.set(id, buf);
    }
    buf.push({ t: now, x: p.x, y: p.y, z: p.z, rotation: p.rotation });
    if (buf.length > MAX_SAMPLES) buf.shift();
  }
  for (const id of buffers.keys()) if (!seen.has(id)) buffers.delete(id);
}

/** Forget everything (call on room change / disconnect). */
export function clearSnapshots(): void {
  buffers.clear();
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/**
 * Sample a player's transform at `renderTime`, interpolating between bracketing
 * snapshots. Clamps to the ends (no extrapolation) and returns null if the
 * player has no buffer yet.
 */
export function sampleTransform(id: string, renderTime: number): NetTransform | null {
  const buf = buffers.get(id);
  if (!buf || buf.length === 0) return null;
  const oldest = buf[0]!;
  const newest = buf[buf.length - 1]!;
  if (buf.length === 1 || renderTime <= oldest.t) return strip(oldest);
  if (renderTime >= newest.t) return strip(newest);

  for (let i = 0; i < buf.length - 1; i++) {
    const a = buf[i]!;
    const b = buf[i + 1]!;
    if (renderTime >= a.t && renderTime <= b.t) {
      const span = b.t - a.t;
      const f = span > 1e-3 ? (renderTime - a.t) / span : 0;
      return {
        x: lerp(a.x, b.x, f),
        y: lerp(a.y, b.y, f),
        z: lerp(a.z, b.z, f),
        rotation: lerpAngle(a.rotation, b.rotation, f),
      };
    }
  }
  return strip(newest);
}

const strip = (s: Sample): NetTransform => ({ x: s.x, y: s.y, z: s.z, rotation: s.rotation });
