import type { AbilityDef } from '@arena/shared';
import type { Player } from '../schema.js';

/**
 * Pure combat-geometry helpers — no room state, just math on the values passed
 * in. Lifted out of ArenaRoom so the room file stays focused on orchestration.
 */

/** Normalize a raw aim vector to a unit direction; falls back to the player's
 *  current facing when the input is ~zero. */
export function normalizeAim(
  player: Player,
  rawX: unknown,
  rawZ: unknown,
): { dirX: number; dirZ: number } {
  let dirX = Number.isFinite(rawX) ? (rawX as number) : 0;
  let dirZ = Number.isFinite(rawZ) ? (rawZ as number) : 0;
  const len = Math.hypot(dirX, dirZ);
  if (len > 1e-3) {
    dirX /= len;
    dirZ /= len;
  } else {
    dirX = Math.sin(player.rotation);
    dirZ = Math.cos(player.rotation);
  }
  return { dirX, dirZ };
}

/** True when the point (ox, oz) lies inside `caster`'s channelled beam — within
 *  its range along the aim axis and within half the beam width (plus `pad`). */
export function inBeam(
  caster: Player,
  ox: number,
  oz: number,
  pad: number,
  config: AbilityDef,
): boolean {
  const rx = ox - caster.x;
  const rz = oz - caster.z;
  const along = rx * caster.channelDirX + rz * caster.channelDirZ; // along the axis
  if (along < 0 || along > config.range) return false;
  const perp = Math.abs(rx * caster.channelDirZ - rz * caster.channelDirX); // |cross|, unit dir
  return perp <= (config.beamWidth ?? 0.6) / 2 + pad;
}
