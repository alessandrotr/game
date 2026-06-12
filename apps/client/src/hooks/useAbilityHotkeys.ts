import { useEffect, useRef } from 'react';
import { ABILITIES, CLASS_LOADOUTS, type AbilityKind, type AbilitySlot } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCursorGround } from '../store/cursorState';
import { sendCast } from '../network/colyseus';
import { clearDestination } from '../store/destinationState';
import { setLocalDash } from '../store/dashState';
import { isOnCooldown, triggerCooldown } from '../store/abilityCooldowns';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { useAbilityTargeting } from '../store/abilityTargeting';

/**
 * MOBA ability input: Q/W/E/R cast the abilities bound to those slots for the
 * local player's class (via `CLASS_LOADOUTS`); Space jumps. No WASD — movement
 * is point-and-click (see `MouseMove`).
 *
 * Aimed abilities (LoL-style) **hold to aim, release to fire**: holding the key
 * shows a ground indicator that follows the cursor (`GroundTargeter`), and
 * releasing casts toward it — a `direction` skillshot along the cursor, or a
 * `point` ground-target under it. Right-click / Esc cancel. Self / point-blank
 * abilities cast instantly on press. The server is authoritative; we mirror its
 * mana/cooldown gates so the action-bar display stays honest.
 */
const SLOT_BY_CODE: Record<string, AbilitySlot> = {
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
  KeyR: 'R',
};

export function useAbilityHotkeys(enabled: boolean): void {
  // The keyboard code currently held to aim an ability (so its keyup fires it).
  const aimingCode = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };

    /** Resolve the local player, or undefined if not ready / dead. */
    const localPlayer = () => {
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      return me && me.alive ? me : undefined;
    };

    const castInstant = (ability: AbilityKind, fromId: string) => {
      const config = ABILITIES[ability];
      const local = getLocalRenderTransform();
      const rotation = local.active ? local.rotation : 0;
      sendCast(ability, Math.sin(rotation), Math.cos(rotation));
      triggerCooldown(ability, config.cooldownMs);
      pushAnimationEvent(fromId, 'cast');
      // A rooted cast (wind-up) stops the player server-side; mirror that locally
      // so they hold still for the cast pose instead of sliding toward a stale
      // destination. Instant casts keep their destination and keep moving.
      if (config.castTimeMs > 0) clearDestination();
    };

    /** Nearest living player to the cursor (within a small pick radius), for
     *  unit-targeted abilities. Includes yourself (so a friendly cast can target
     *  self by hovering over your own character). */
    const pickUnitTarget = (): { id: string; x: number; z: number } | null => {
      const cur = getCursorGround();
      const { players } = useGameStore.getState();
      let best: { id: string; x: number; z: number } | null = null;
      let bestD = 2.5 * 2.5; // pick radius²
      players.forEach((p, id) => {
        if (!p.alive) return;
        const d = (p.x - cur.x) * (p.x - cur.x) + (p.z - cur.z) * (p.z - cur.z);
        if (d < bestD) {
          bestD = d;
          best = { id, x: p.x, z: p.z };
        }
      });
      return best;
    };

    /** Cast a unit-targeted ability at the player under the cursor (server
     *  validates range and falls back to self when no valid target). */
    const castUnit = (ability: AbilityKind, fromId: string) => {
      const config = ABILITIES[ability];
      const target = pickUnitTarget();
      const me = getLocalRenderTransform();
      let dx = 0;
      let dz = 1;
      if (target) {
        dx = target.x - me.x;
        dz = target.z - me.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
      }
      sendCast(ability, dx, dz, undefined, undefined, target?.id);
      triggerCooldown(ability, config.cooldownMs);
      pushAnimationEvent(fromId, 'cast');
      // A rooted cast (wind-up) stops the player server-side; mirror that locally
      // so they hold still for the cast pose instead of sliding toward a stale
      // destination. Instant casts keep their destination and keep moving.
      if (config.castTimeMs > 0) clearDestination();
    };

    /** Fire an aimed ability toward the cursor (called on key release). */
    const fireAimed = (ability: AbilityKind, fromId: string) => {
      const config = ABILITIES[ability];
      const me = getLocalRenderTransform();
      const cur = getCursorGround();
      let dx = cur.x - me.x;
      let dz = cur.z - me.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      if (config.aim === 'point') {
        sendCast(ability, dx, dz, cur.x, cur.z);
      } else {
        sendCast(ability, dx, dz);
      }
      // Predict a dash locally (charge / tumble) so it slides smoothly in the
      // aim direction — even mid-run — instead of fighting the move prediction.
      for (const e of config.effects) {
        if (e.type === 'dash') {
          setLocalDash(dx, dz, e.distance, e.speed);
          clearDestination();
          break;
        }
      }
      triggerCooldown(ability, config.cooldownMs);
      pushAnimationEvent(fromId, 'cast');
      // A rooted cast (wind-up) stops the player server-side; mirror that locally
      // so they hold still for the cast pose instead of sliding toward a stale
      // destination. Instant casts keep their destination and keep moving.
      if (config.castTimeMs > 0) clearDestination();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isTyping()) return;

      if (e.code === 'Escape') {
        useAbilityTargeting.getState().cancel();
        aimingCode.current = null;
        return;
      }

      const slot = SLOT_BY_CODE[e.code];
      if (!slot) return;
      const me = localPlayer();
      if (!me) return;

      const ability = CLASS_LOADOUTS[me.characterClass][slot];
      if (!ability) return; // empty slot

      // Starting any cast clears a different in-progress aim.
      useAbilityTargeting.getState().cancel();
      aimingCode.current = null;

      // Mirror the server's gates so the optimistic cooldown display stays true.
      const config = ABILITIES[ability];
      if (isOnCooldown(ability) || me.mana < config.manaCost) return;

      if (config.aim === 'direction' || config.aim === 'point') {
        // Hold to aim; the matching keyup fires toward the cursor.
        useAbilityTargeting.getState().begin(ability);
        aimingCode.current = e.code;
      } else if (config.aim === 'unit') {
        // Instant cast on the player under the cursor.
        castUnit(ability, me.sessionId);
      } else {
        // 'self' / unspecified: instant self / point-blank cast.
        castInstant(ability, me.sessionId);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== aimingCode.current) return;
      aimingCode.current = null;
      const pending = useAbilityTargeting.getState().pending;
      useAbilityTargeting.getState().cancel();
      const me = localPlayer();
      // Re-check gates at release (mana may have changed mid-aim).
      if (pending && me && !isOnCooldown(pending) && me.mana >= ABILITIES[pending].manaCost) {
        fireAimed(pending, me.sessionId);
      }
    };

    const onBlur = () => {
      aimingCode.current = null;
      useAbilityTargeting.getState().cancel();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);
}
