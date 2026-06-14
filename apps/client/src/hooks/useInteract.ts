import { useEffect } from 'react';
import { sendInteract } from '../network/colyseus';

/**
 * Spacebar → pickable interaction, the arena's replacement for jump: grab a
 * nearby pickable object when empty-handed, or throw the one being carried along
 * the player's facing. The server decides which applies. Ignored while typing in
 * a text field so chat/forms keep the spacebar.
 */
export function useInteract(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      sendInteract();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
