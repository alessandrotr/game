import { useEffect } from 'react';
import { useHudStore } from '../store/useHudStore';

/**
 * Global "hide HUD" hotkey (`H`) for screenshots/immersion. Follows the same
 * window-keydown pattern as ChatPanel: ignore the key while typing in a text
 * field, and bail on any modifier so browser shortcuts (⌘H, Ctrl+H) are
 * untouched. `enabled` gates it to active gameplay.
 */
export function useHudHotkey(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      useHudStore.getState().toggleHidden();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
