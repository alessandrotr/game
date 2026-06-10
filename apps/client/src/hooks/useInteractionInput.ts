import { useEffect } from 'react';
import { findNpcById } from '../assets/data/npcs';
import { useInteractionStore } from '../store/interactionState';

/**
 * NPC interaction input (Phase 8.3): F talks to the nearby NPC and advances an
 * open dialogue; Escape closes it. Movement (point-and-click) and abilities
 * (QWER) stay free — dialogue is a non-blocking overlay.
 */
export function useInteractionInput(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Ignore keys while typing in a text field (chat).
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const store = useInteractionStore.getState();

      if (e.code === 'Escape') {
        if (store.dialogue) store.close();
        return;
      }
      if (e.code !== 'KeyF') return;

      if (store.dialogue) {
        store.advance();
      } else if (store.nearbyNpcId) {
        const npc = findNpcById(store.nearbyNpcId);
        if (npc) store.open(npc.id, npc.name, npc.dialogueId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
