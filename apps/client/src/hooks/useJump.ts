import { useEffect } from 'react';
import { sendJump } from '../network/colyseus';

/**
 * Space-to-jump, active in both the town and the arena (the server applies it
 * only when grounded). Ignored while typing in a text field so chat/forms keep
 * the spacebar. Kept separate from the ability hotkeys (which are arena-only).
 */
export function useJump(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      sendJump();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
