import type { AbilityKind } from '@arena/shared';

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

/** Clear all cooldowns (e.g. on disconnect / respawn into a fresh match). */
export function resetCooldowns(): void {
  readyAt.clear();
}
