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
  /** Clamp |x|,|z| to this (typically WORLD_HALF − PLAYER_RADIUS). */
  halfBounds: number;
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

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
export function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/**
 * Resolve a point out of any overlapping circles by pushing it to the nearest
 * surface. Applied to the post-move position, this yields sliding: the inward
 * (normal) penetration is removed while tangential travel is preserved.
 */
export function resolveCircles(x: number, z: number, circles: readonly Circle[]): { x: number; z: number } {
  for (const o of circles) {
    const dx = x - o.x;
    const dz = z - o.z;
    const min = o.radius + PLAYER_RADIUS;
    const distSq = dx * dx + dz * dz;
    if (distSq < min * min && distSq > 1e-9) {
      const d = Math.sqrt(distSq);
      x = o.x + (dx / d) * min;
      z = o.z + (dz / d) * min;
    }
  }
  return { x, z };
}

/**
 * Advance one locomotion step toward `dest` (or null = stand still). Fixed order:
 * step toward target → slide around obstacles → clamp to bounds → face travel
 * direction → final safety resolve. Pure: returns the next transform, mutates
 * nothing.
 */
export function stepLocomotion(
  cur: LocomotionState,
  dest: { x: number; z: number } | null,
  p: LocomotionParams,
  dt: number,
): LocomotionResult {
  let { x, z, rotation } = cur;
  let arrived = false;

  if (dest) {
    const dx = dest.x - x;
    const dz = dest.z - z;
    const distance = Math.hypot(dx, dz);
    const remaining = distance - p.stoppingDistance;
    if (remaining > 0.02 && distance > 1e-6) {
      const ndx = dx / distance;
      const ndz = dz / distance;
      const step = Math.min(p.speed * dt, remaining);
      // Advance, then slide around obstacles (push-out preserves tangential motion).
      const slid = resolveCircles(x + ndx * step, z + ndz * step, p.obstacles);
      x = clamp(slid.x, -p.halfBounds, p.halfBounds);
      z = clamp(slid.z, -p.halfBounds, p.halfBounds);
      rotation = lerpAngle(rotation, Math.atan2(ndx, ndz), 1 - Math.exp(-p.rotationSpeed * dt));
    } else {
      arrived = true;
    }
  }

  // Final resolve catches spawn overlaps and any re-entry from the bounds clamp.
  const fixed = resolveCircles(x, z, p.obstacles);
  return { x: fixed.x, z: fixed.z, rotation, arrived };
}
