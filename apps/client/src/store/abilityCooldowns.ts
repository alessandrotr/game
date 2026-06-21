import type { AbilityKind } from '@arena/shared';
import { useGameStore } from './useGameStore';

/**
 * Client-side ability cooldown tracker — for the action-bar display and to avoid
 * spamming the server with casts it will only reject. The **server remains
 * authoritative** for whether a cast actually happens; this mirror is started
 * optimistically when we send a cast (the hotkey layer first checks mana and
 * this timer, matching the server's gates, so they stay in agreement).
 *
 * Plain mutable singleton read each render — no React state, no re-renders here.
 */
const readyAt = new Map<AbilityKind, number>();

/** Begin a cooldown of `cooldownMs` for an ability, starting now. */
export function triggerCooldown(ability: AbilityKind, cooldownMs: number): void {
  readyAt.set(ability, performance.now() + cooldownMs);
}

/** Milliseconds remaining on an ability's cooldown (0 if ready). */
export function cooldownRemaining(ability: AbilityKind): number {
  const end = readyAt.get(ability);
  if (end === undefined) return 0;
  return Math.max(0, end - performance.now());
}

export function isOnCooldown(ability: AbilityKind): boolean {
  return cooldownRemaining(ability) > 0;
}

/** Clear all cooldowns, or a specific ability's cooldown if provided. */
export function resetCooldowns(ability?: AbilityKind): void {
  if (ability) {
    readyAt.delete(ability);
  } else {
    readyAt.clear();
  }
}

/** Get local player's cooldown multiplier based on active perks. */
export function getLocalCooldownMult(): number {
  const { sessionId, players } = useGameStore.getState();
  const me = sessionId ? players.get(sessionId) : undefined;
  if (!me) return 1;
  let mult = 1;
  const perks = [me.perk1, me.perk2, me.perk3];
  for (const perk of perks) {
    if (perk === 'quick_hands') mult *= 0.85;
    else if (perk === 'rapid_fire') mult *= 0.70;
    else if (perk === 'overclock') mult *= 0.55;
  }
  return mult;
}

/** Get local player's mana cost multiplier based on active perks. */
export function getLocalManaCostMult(): number {
  const { sessionId, players } = useGameStore.getState();
  const me = sessionId ? players.get(sessionId) : undefined;
  if (!me) return 1;
  let mult = 1;
  const perks = [me.perk1, me.perk2, me.perk3];
  for (const perk of perks) {
    if (perk === 'arcane_reservoir') mult *= 0.85;
    else if (perk === 'infinite_power') mult *= 0.70;
  }
  return mult;
}
