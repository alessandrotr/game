import { useEffect } from 'react';
import { sendInteract } from '../network/colyseus';
import { ALTAR_ASSET_ID, ALTAR_RITUAL_RADIUS } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/**
 * Spacebar → pickable interaction, the arena's replacement for jump: grab a
 * nearby pickable object when empty-handed, or throw the one being carried along
 * the player's facing. The server decides which applies. Ignored while typing in
 * a text field so chat/forms keep the spacebar.
 * 
 * If standing inside the Altar of Resonance ritual ring and the altar is ready,
 * this is overridden by the Altar claiming ritual channel.
 */
export function useInteract(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      // Overridden check: if we are in the Altar ritual ring and the Altar is ready,
      // let useRitual handle the Spacebar channelling.
      const state = useGameStore.getState();
      const localPlayer = state.sessionId ? state.players.get(state.sessionId) : null;
      let canChannel = false;
      if (localPlayer && state.zombieMode) {
        let hasAltar = false;
        for (const id of state.structureIds) {
          if (state.structures.get(id)?.assetId === ALTAR_ASSET_ID) {
            hasAltar = true;
            break;
          }
        }
        const gemsReady = (state.altarGemsLit & 15) === 15;
        const dx = localPlayer.x;
        const dz = localPlayer.z;
        const inRitualZone = dx * dx + dz * dz <= ALTAR_RITUAL_RADIUS * ALTAR_RITUAL_RADIUS;
        canChannel = hasAltar && gemsReady && inRitualZone;
      }

      if (canChannel) return;

      e.preventDefault();
      sendInteract();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
