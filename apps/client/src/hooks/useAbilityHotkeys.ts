import { useEffect } from 'react';
import { ABILITIES, CLASS_LOADOUTS, type AbilitySlot } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { sendCast, sendJump } from '../network/colyseus';
import { isOnCooldown, triggerCooldown } from '../store/abilityCooldowns';

/**
 * MOBA ability input: Q/W/E/R cast the abilities bound to those slots for the
 * local player's class (via `CLASS_LOADOUTS`); Space jumps. There is no WASD —
 * movement is point-and-click (see `MouseMove`).
 *
 * The cast direction is the local player's current (predicted) facing. The
 * server validates cooldown/mana, applies the effect, and broadcasts results —
 * clients only request and render. We gate the send on the same mana/cooldown
 * checks the server uses so we neither spam rejected casts nor desync the
 * action-bar cooldown display.
 */
const SLOT_BY_CODE: Record<string, AbilitySlot> = {
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
  KeyR: 'R',
};

export function useAbilityHotkeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'Space') {
        e.preventDefault();
        sendJump();
        return;
      }

      const slot = SLOT_BY_CODE[e.code];
      if (!slot) return;

      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      if (!me || !me.alive) return;

      const ability = CLASS_LOADOUTS[me.characterClass][slot];
      if (!ability) return; // empty slot

      // Mirror the server's gates so the optimistic cooldown display stays true.
      const config = ABILITIES[ability];
      if (isOnCooldown(ability) || me.mana < config.manaCost) return;

      // Use the client-PREDICTED facing, not the server snapshot rotation —
      // the snapshot lags ~1+ ticks and is still interpolating, which made
      // abilities fire in a stale direction when you turned quickly.
      const local = getLocalRenderTransform();
      const rotation = local.active ? local.rotation : me.rotation;
      sendCast(ability, Math.sin(rotation), Math.cos(rotation));
      triggerCooldown(ability, config.cooldownMs);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
