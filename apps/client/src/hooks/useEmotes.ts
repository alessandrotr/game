import { useEffect } from 'react';
import { EMOTES } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { sendEmote } from '../network/colyseus';
import { pushAnimationEvent } from '../render/animation/animationEvents';

/**
 * Number keys (1, 2, …) play emotes (dances), in both town and arena. Sends the
 * emote to the server (so everyone sees it) and pushes it locally so the
 * predicted local player dances with zero latency. Ignored while typing.
 */
export function useEmotes(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const match = /^Digit([1-9])$/.exec(e.code);
      if (!match) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const emote = EMOTES[Number(match[1]) - 1];
      if (!emote) return;
      e.preventDefault();
      sendEmote(emote);
      const sid = useGameStore.getState().sessionId;
      if (sid) pushAnimationEvent(sid, emote);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
