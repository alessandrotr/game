import { computePerkModifiers, isPerkId, ABILITIES, type AbilityKind } from '@arena/shared';
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

let ninjaEFirstCast: number | null = null;
let ninjaEStage = 0; // 0 = ready, 1 = first cast done, waiting for window, 2 = second cast done / cooldown

export function isNinjaERecastActive(): boolean {
  if (ninjaEStage !== 1 || ninjaEFirstCast === null) return false;
  const now = performance.now();
  return now >= ninjaEFirstCast + 314 && now <= ninjaEFirstCast + 1700;
}

export function getAbilityManaCost(ability: AbilityKind): number {
  const config = ABILITIES[ability];
  if (!config) return 0;
  if (ability === 'ninja_e' && isNinjaERecastActive()) {
    return config.manaCost + 10;
  }
  return config.manaCost;
}

/** Begin a cooldown of `cooldownMs` for an ability, starting now. */
export function triggerCooldown(ability: AbilityKind, cooldownMs: number): void {
  if (ability === 'ninja_e') {
    const now = performance.now();
    if (ninjaEStage === 0) {
      ninjaEStage = 1;
      ninjaEFirstCast = now;
      readyAt.set('ninja_e', now + 314);
      return;
    } else if (ninjaEStage === 1) {
      ninjaEStage = 0;
      ninjaEFirstCast = null;
      readyAt.set('ninja_e', now + 6000 * getLocalCooldownMult());
      return;
    }
  }
  readyAt.set(ability, performance.now() + cooldownMs);
}

/** Milliseconds remaining on an ability's cooldown (0 if ready). */
export function cooldownRemaining(ability: AbilityKind): number {
    if (ability === 'ninja_e') {
      const now = performance.now();
      if (ninjaEStage === 1 && ninjaEFirstCast !== null) {
        const windowStart = ninjaEFirstCast + 314;
        const windowEnd = ninjaEFirstCast + 1700;
        if (now < windowStart) {
          return windowStart - now;
        } else if (now <= windowEnd) {
          return 0;
        } else {
          ninjaEStage = 0;
          ninjaEFirstCast = null;
          readyAt.set('ninja_e', now + 3000 * getLocalCooldownMult());
          return 3000 * getLocalCooldownMult();
        }
      }
    }

  const end = readyAt.get(ability);
  if (end === undefined) return 0;
  return Math.max(0, end - performance.now());
}

export function isOnCooldown(ability: AbilityKind): boolean {
  return cooldownRemaining(ability) > 0;
}

export function resetCooldowns(ability?: AbilityKind): void {
  if (ability) {
    readyAt.delete(ability);
    if (ability === 'ninja_e') {
      ninjaEStage = 0;
      ninjaEFirstCast = null;
    }
  } else {
    readyAt.clear();
    ninjaEStage = 0;
    ninjaEFirstCast = null;
  }
}

/** The local player's aggregate perk modifiers, computed from the same shared
 *  data the server uses (so the optimistic mirror can't disagree with it). */
function localPerkModifiers() {
  const { sessionId, players } = useGameStore.getState();
  const me = sessionId ? players.get(sessionId) : undefined;
  if (!me) return undefined;
  return computePerkModifiers([me.perk1, me.perk2, me.perk3].filter(isPerkId));
}

/** Get local player's cooldown multiplier based on active perks. */
export function getLocalCooldownMult(): number {
  return localPerkModifiers()?.cooldownMult ?? 1;
}

/** Get local player's mana cost multiplier based on active perks. */
export function getLocalManaCostMult(): number {
  return localPerkModifiers()?.manaCostMult ?? 1;
}
