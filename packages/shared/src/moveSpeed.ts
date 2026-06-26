/**
 * Effective move-speed fold — the single source of truth for how a player's
 * walk speed is modified by perks, low-HP "adrenaline" perks, and slow/haste
 * statuses.
 *
 * The server simulates locomotion and the client predicts it with the SAME
 * shared `stepLocomotion` step, but that step takes `speed` as a black-box
 * parameter — the caller derives it. If the two sides derive it differently the
 * predicted position drifts from the authority and the body snaps on reconcile
 * (the "speed change isn't visible, then jumps forward" bug). Folding the
 * formula here, called identically on both sides, keeps them in lockstep.
 *
 * `base` is the class walk speed already net of the mode walk-speed penalty.
 */

import type { PerkModifiers } from './perk-modifiers.js';
import { moveSpeedMultiplier, type StatusCarrier } from './status.js';

/** HP fraction below which low-HP ("adrenaline") perk bonuses activate. */
export const LOW_HP_FRACTION = 0.4;

/** True when low-HP perk bonuses should apply (alive and under the threshold). */
export function isLowHp(hp: number, maxHp: number, alive: boolean): boolean {
  return alive && maxHp > 0 && hp / maxHp < LOW_HP_FRACTION;
}

/** Perk-derived flat speed bonus + multiplier, gated by low-HP. */
export function perkSpeed(mods: PerkModifiers, lowHp: boolean): { bonus: number; mult: number } {
  let bonus = mods.moveSpeedBonus;
  let mult = 1;
  if (lowHp) {
    mult *= mods.lowHpSpeedMult;
    bonus += mods.lowHpSpeedBonus;
  }
  return { bonus, mult };
}

/** Final move speed: (base + perk bonus) × slow/haste status × perk mult. */
export function effectiveMoveSpeed(
  base: number,
  mods: PerkModifiers,
  carrier: StatusCarrier,
  lowHp: boolean,
): number {
  const ps = perkSpeed(mods, lowHp);
  return (base + ps.bonus) * moveSpeedMultiplier(carrier) * ps.mult;
}
