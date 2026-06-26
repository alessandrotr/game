import { ABILITIES, CLASS_LOADOUTS, type AbilitySlot, type CharacterClass } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { sendCast } from '../network/colyseus';
import { clearDestination } from '../store/destinationState';
import { setLocalDash } from '../store/dashState';
import {
  isOnCooldown,
  triggerCooldown,
  getLocalCooldownMult,
  getLocalManaCostMult,
} from '../store/abilityCooldowns';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { useAbilityTargeting } from '../store/abilityTargeting';

/**
 * Touch-first ability casting: a single tap on an ability button fires it with
 * no aim step. Self/point-blank abilities cast on the spot; everything that
 * needs a target (skillshots, ground-targets, unit-targets, channels) is
 * auto-aimed at the nearest enemy — falling back to the player's current facing
 * when no enemy is in range. The desktop hold-to-aim flow (see
 * `useAbilityHotkeys`) is untouched; this is the mobile counterpart.
 *
 * The server stays authoritative (it re-validates range / mana / cooldown); we
 * mirror its gates so the action-bar display stays honest.
 */

/** Resolve the local player, or undefined if not ready / dead. */
function localPlayer() {
  const { sessionId, players } = useGameStore.getState();
  const me = sessionId ? players.get(sessionId) : undefined;
  return me && me.alive ? me : undefined;
}

/**
 * Nearest living *enemy* to the local player, for auto-aim. In FFA / zombie
 * modes the local player's team gives no foe signal, so we treat any other
 * living player (zombies are players too) as a candidate. In team modes the
 * opposing team is preferred. Returns null when nobody is in range.
 */
function nearestEnemy(): { id: string; x: number; z: number } | null {
  const { sessionId, players } = useGameStore.getState();
  const me = sessionId ? players.get(sessionId) : undefined;
  if (!me) return null;
  let best: { id: string; x: number; z: number } | null = null;
  let bestD = Infinity;
  players.forEach((p, id) => {
    if (id === sessionId || !p.alive) return;
    const d = (p.x - me.x) * (p.x - me.x) + (p.z - me.z) * (p.z - me.z);
    if (d < bestD) {
      bestD = d;
      best = { id, x: p.x, z: p.z };
    }
  });
  return best;
}

/** Normalized direction from the local player toward a world point. */
function dirToward(x: number, z: number): { dx: number; dz: number } {
  const me = getLocalRenderTransform();
  const dx = x - me.x;
  const dz = z - me.z;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len };
}

/** The player's current facing as a unit direction (for enemy-less fallback). */
function facingDir(): { dx: number; dz: number } {
  const me = getLocalRenderTransform();
  return { dx: Math.sin(me.rotation), dz: Math.cos(me.rotation) };
}

/**
 * Fire the ability bound to `slot` for the local player's class with mobile
 * auto-aim. No-op when the slot is empty, gated, or the player is unavailable.
 */
export function castAbilitySlotMobile(slot: AbilitySlot): void {
  const me = localPlayer();
  if (!me) return;

  const ability = CLASS_LOADOUTS[me.characterClass as CharacterClass]?.[slot];
  if (!ability) return; // empty slot
  const config = ABILITIES[ability];

  // A tap always clears any in-progress desktop aim.
  useAbilityTargeting.getState().cancel();

  const enemy = nearestEnemy();
  const aim = enemy ? dirToward(enemy.x, enemy.z) : facingDir();

  // Channelled abilities (priest beam): tap to start, tap again to interrupt.
  if (config.channelMs) {
    if (me.channelAbility === ability) {
      sendCast(ability, 0, 1); // re-press interrupts (server ignores the dir)
      return;
    }
    if (isOnCooldown(ability) || me.mana < config.manaCost * getLocalManaCostMult()) return;
    sendCast(ability, aim.dx, aim.dz);
    triggerCooldown(ability, config.cooldownMs * getLocalCooldownMult());
    pushAnimationEvent(me.sessionId, 'cast');
    return;
  }
  if (me.channelAbility) return; // locked out while channelling

  // Mirror the server's gates so the optimistic cooldown display stays true.
  if (isOnCooldown(ability) || me.mana < config.manaCost * getLocalManaCostMult()) return;

  if (config.aim === 'unit') {
    // Unit-targeted: aim at the nearest enemy (server falls back to self).
    sendCast(ability, aim.dx, aim.dz, undefined, undefined, enemy?.id);
  } else if (config.aim === 'point') {
    // Ground-targeted: drop it on the enemy, or a point ahead when none.
    const me2 = getLocalRenderTransform();
    const px = enemy ? enemy.x : me2.x + aim.dx * 6;
    const pz = enemy ? enemy.z : me2.z + aim.dz * 6;
    sendCast(ability, aim.dx, aim.dz, px, pz);
  } else if (config.aim === 'direction') {
    // Skillshot toward the enemy / facing. Predict any dash so it slides.
    sendCast(ability, aim.dx, aim.dz);
    for (const e of config.effects) {
      if (e.type === 'dash') {
        setLocalDash(aim.dx, aim.dz, e.distance, e.speed);
        break;
      }
    }
  } else {
    // 'self' / unspecified: instant self / point-blank cast along facing.
    const f = facingDir();
    sendCast(ability, f.dx, f.dz);
  }

  triggerCooldown(ability, config.cooldownMs * getLocalCooldownMult());
  pushAnimationEvent(me.sessionId, 'cast');
  // A rooted cast (wind-up) stops the player server-side; mirror that locally.
  if (config.castTimeMs > 0) clearDestination();
}
