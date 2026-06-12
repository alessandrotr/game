import { GRAVITY, GROUND_Y, stepLocomotion, type LocomotionParams } from '@arena/shared';
import type { Player } from '../schema.js';

/**
 * The low-level per-tick avatar motion shared by every walkable room (arena +
 * town). Both rooms integrate gravity and walk toward a destination identically;
 * the surrounding `update` loops differ (combat vs. social) but funnel through
 * these two steps.
 */

/** Clamp a value into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Integrate one tick of gravity (and landing) for a player. Mutates `player.y`
 * and returns the new vertical velocity plus whether they're grounded this tick.
 */
export function applyGravity(
  player: Player,
  verticalVelocity: number,
  dt: number,
): { vy: number; grounded: boolean } {
  let vy = verticalVelocity - GRAVITY * dt;
  player.y += vy * dt;
  if (player.y <= GROUND_Y) {
    player.y = GROUND_Y;
    vy = 0;
    return { vy, grounded: true };
  }
  return { vy, grounded: false };
}

/**
 * Walk a player one tick toward `dest` via the shared deterministic step (the
 * same code the client predictor runs, so client and server stay in lockstep).
 * Mutates `x`/`z`/`rotation`; returns true once they've arrived (the caller
 * clears the destination).
 */
export function stepMove(
  player: Player,
  dest: { x: number; z: number } | null,
  params: LocomotionParams,
  dt: number,
): boolean {
  const result = stepLocomotion(
    { x: player.x, z: player.z, rotation: player.rotation },
    dest,
    params,
    dt,
  );
  player.x = result.x;
  player.z = result.z;
  player.rotation = result.rotation;
  return result.arrived;
}
