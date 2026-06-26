import { useEffect } from 'react';
import { sendRitualChannel } from '../network/colyseus';

/**
 * Resonance of the Void — hold **F** to channel the altar ritual and claim the
 * superweapon. Press starts the channel, release stops it; the server validates
 * everything (all 4 gems lit, a wave in progress, standing in the ritual ring,
 * enough mana), so an invalid press is simply a no-op. Ignored while typing.
 */
export function useRitual(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || e.repeat || isTyping()) return;
      e.preventDefault();
      sendRitualChannel(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF') return;
      sendRitualChannel(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled]);
}
