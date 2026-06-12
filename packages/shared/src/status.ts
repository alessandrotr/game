/**
 * Pure helpers for reasoning about a combatant's active status effects. No
 * Colyseus, no room state — both the authoritative server (gating moves/casts,
 * scaling speed/damage) and the client (prediction + UI) read through these so
 * the rules live in exactly one place.
 *
 * Active-vs-expired is the server's job: it prunes elapsed statuses every tick
 * (see `ArenaRoom.updateStatuses`), so a status being *present* means it's live.
 * These helpers therefore just scan the list by kind.
 */

import type { StatusKind } from './abilities/effects.js';

/** The status shape these helpers need — satisfied by both the server schema
 *  `StatusEffect` and the client `StatusView`. */
export interface StatusLike {
  kind: StatusKind;
  /** Scalar for stat-modifying kinds (see {@link StatusKind}); 0 if unused. */
  magnitude: number;
}

/** Anything carrying a list of statuses (a `Player` schema or a `PlayerView`). */
export interface StatusCarrier {
  statuses: Iterable<StatusLike>;
}

/** True if any active status of `kind` is present. */
export function hasStatus(carrier: StatusCarrier, kind: StatusKind): boolean {
  for (const s of carrier.statuses) if (s.kind === kind) return true;
  return false;
}

/** Stunned: cannot move, cast, or auto-attack. */
export function isStunned(carrier: StatusCarrier): boolean {
  return hasStatus(carrier, 'stun');
}

/** Rooted (or stunned): cannot move. */
export function isRooted(carrier: StatusCarrier): boolean {
  return hasStatus(carrier, 'root') || hasStatus(carrier, 'stun');
}

/** Silenced (or stunned): cannot cast abilities. */
export function isSilenced(carrier: StatusCarrier): boolean {
  return hasStatus(carrier, 'silence') || hasStatus(carrier, 'stun');
}

/**
 * Net move-speed multiplier from `slow` (×<1) and `haste` (×>1) statuses; they
 * stack multiplicatively. Does NOT account for root/stun — gate those via
 * {@link isRooted} (movement is skipped entirely, not scaled to zero).
 */
export function moveSpeedMultiplier(carrier: StatusCarrier): number {
  let m = 1;
  for (const s of carrier.statuses) {
    if (s.kind === 'slow' || s.kind === 'haste') m *= s.magnitude || 1;
  }
  return m;
}

/** Net auto-attack speed multiplier (>1 = faster) from `attack_speed` statuses. */
export function attackSpeedMultiplier(carrier: StatusCarrier): number {
  let m = 1;
  for (const s of carrier.statuses) {
    if (s.kind === 'attack_speed') m *= s.magnitude || 1;
  }
  return m;
}

/** Net incoming-damage multiplier (>1 = more vulnerable) from `damage_amp`. */
export function damageTakenMultiplier(carrier: StatusCarrier): number {
  let m = 1;
  for (const s of carrier.statuses) {
    if (s.kind === 'damage_amp') m *= s.magnitude || 1;
  }
  return m;
}
