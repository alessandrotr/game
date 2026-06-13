import { useEffect } from 'react';
import { audioEngine } from './engine';

/** User gestures that satisfy the browser's autoplay policy. */
const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Browsers suspend audio until a user gesture. Resume the engine on the first
 * pointer/key/touch anywhere, once, then stop listening. The JoinScreen audio
 * control's own click is also a valid gesture, so muting/unmuting works even
 * before any other interaction.
 */
export function useAudioUnlock(): void {
  useEffect(() => {
    const remove = () => GESTURES.forEach((e) => window.removeEventListener(e, unlock));
    const unlock = () => {
      audioEngine.unlock();
      remove();
    };
    GESTURES.forEach((e) => window.addEventListener(e, unlock));
    return remove;
  }, []);
}
