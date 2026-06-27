/**
 * Deterministic, side-effect-free locomotion step shared by the server
 * simulation and the client predictor. Running the SAME integration on both
 * sides means a client's prediction matches the server by construction, so
 * reconciliation is a no-op except on real repositions (respawn/knockback) —
 * the foundation of smooth, rubber-band-free click-to-move.
 *
 * Single move speed (no distance auto-sprint). Obstacles use collide-and-slide:
 * a step that would enter a pillar is pushed back to its surface, which
 * preserves the tangential component so the player glides around it instead of
 * sticking.
 */

import { PLAYER_RADIUS } from './constants.js';

export interface Circle {
  x: number;
  z: number;
  radius: number;
  /** Pathfinding ignores this circle (it's still solid for sliding). Set on small
   *  slide-past objects like the chest, so the router doesn't detour around them. */
  noRoute?: boolean;
}

export interface LocomotionState {
  x: number;
  z: number;
  rotation: number;
}

export interface LocomotionParams {
  /** Move speed, world units/second (single speed — the class moveSpeed). */
  speed: number;
  /** Turn rate toward the travel direction (1/second). */
  rotationSpeed: number;
  /** Distance from the destination that counts as arrived (world units). */
  stoppingDistance: number;
  /** Clamp |x| to this (typically WORLD_HALF − PLAYER_RADIUS). */
  halfBounds: number;
  /** Clamp |z| to this; defaults to `halfBounds` (square). The FFA arena passes a
   *  larger value so the arena is longer north/south. */
  halfBoundsZ?: number;
  /** Circular obstacles to slide around. */
  obstacles: readonly Circle[];
}

export interface LocomotionResult {
  x: number;
  z: number;
  rotation: number;
  /** True once within stopping distance — the caller should clear the destination. */
  arrived: boolean;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Fixed integration granularity (seconds). The collide-and-slide below is
 * step-size dependent — "advance straight toward the target, then push out of
 * obstacles" traces a different curve around a pillar for a big step than for
 * many small ones. The server ticks at 50ms and the client renders at ~16ms
 * (variable); if each stepped its own dt in one go, their paths around cover
 * would diverge and the body would snap on reconcile (rubber-banding past
 * obstacles). Sub-dividing BOTH sides' dt into chunks of this fixed size makes
 * the slide path depend on the granularity, not the caller's frame/tick rate, so
 * prediction matches authority around cover by construction.
 */
const SUBSTEP_S = 1 / 120;
/** Cap sub-steps per call so a stalled frame (huge dt) can't spin a long loop;
 *  the reconcile snap handles any residual after a real hitch. */
const MAX_SUBSTEPS = 32;

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
export function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/** How many push-out passes to run before giving up. Multi-circle footprints
 *  (trailers/buildings are a ROW of overlapping circles) and dense crowds need
 *  several: pushing out of one circle can shove the point into its neighbour, so
 *  a single pass leaves the point wedged in the seam. Iterating to a clear spot
 *  is what stops the server "getting stuck" on cover while the client slips past. */
const RESOLVE_PASSES = 6;

/**
 * Resolve a point out of any overlapping circles by pushing it to the nearest
 * surface. Applied to the post-move position, this yields sliding: the inward
 * (normal) penetration is removed while tangential travel is preserved. Iterated
 * a few times so it settles cleanly outside overlapping clusters instead of
 * wedging in the seam between two circles.
 */
export function resolveCircles(x: number, z: number, circles: readonly Circle[]): { x: number; z: number } {
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    let moved = false;
    for (const o of circles) {
      const dx = x - o.x;
      const dz = z - o.z;
      const min = o.radius + PLAYER_RADIUS;
      const distSq = dx * dx + dz * dz;
      if (distSq < min * min && distSq > 1e-9) {
        const d = Math.sqrt(distSq);
        x = o.x + (dx / d) * min;
        z = o.z + (dz / d) * min;
        moved = true;
      }
    }
    if (!moved) break; // fully clear — no more pushes needed
  }
  return { x, z };
}

/**
 * Advance locomotion toward `dest` (or null = stand still) over `dt`, integrated
 * in fixed {@link SUBSTEP_S} sub-steps so the obstacle slide is identical on the
 * server (50ms tick) and the client predictor (~16ms frame). Per sub-step, fixed
 * order: step toward target → slide around obstacles → clamp to bounds → face
 * travel direction. Pure: returns the next transform, mutates nothing.
 */
export function stepLocomotion(
  cur: LocomotionState,
  dest: { x: number; z: number } | null,
  p: LocomotionParams,
  dt: number,
): LocomotionResult {
  let { x, z, rotation } = cur;
  let arrived = false;
  const hbZ = p.halfBoundsZ ?? p.halfBounds;

  if (dest && dt > 0) {
    let remainingTime = dt;
    for (let i = 0; i < MAX_SUBSTEPS && remainingTime > 1e-6; i++) {
      const h = Math.min(SUBSTEP_S, remainingTime);
      remainingTime -= h;

      const dx = dest.x - x;
      const dz = dest.z - z;
      const distance = Math.hypot(dx, dz);
      const remaining = distance - p.stoppingDistance;
      if (remaining <= 0.02 || distance <= 1e-6) {
        arrived = true;
        break;
      }
      const ndx = dx / distance;
      const ndz = dz / distance;
      const step = Math.min(p.speed * h, remaining);
      // Advance, then slide around obstacles (push-out preserves tangential motion).
      const slid = resolveCircles(x + ndx * step, z + ndz * step, p.obstacles);
      x = clamp(slid.x, -p.halfBounds, p.halfBounds);
      z = clamp(slid.z, -hbZ, hbZ);
      rotation = lerpAngle(rotation, Math.atan2(ndx, ndz), 1 - Math.exp(-p.rotationSpeed * h));
    }
  }

  // Final resolve catches spawn overlaps and any re-entry from the bounds clamp.
  const fixed = resolveCircles(x, z, p.obstacles);
  return { x: fixed.x, z: fixed.z, rotation, arrived };
}
