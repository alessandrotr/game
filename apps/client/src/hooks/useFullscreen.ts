import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks and toggles the browser's fullscreen state for the whole document.
 * Reactive to changes from any source (the F11 key, the Esc exit, our toggle),
 * so a bound UI control always reflects reality. `requestFullscreen` must be
 * called from a user gesture (e.g. a button click) — calling `toggle()` from a
 * click handler satisfies that.
 */
export function useFullscreen(): { isFullscreen: boolean; toggle: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }, []);

  return { isFullscreen, toggle };
}
