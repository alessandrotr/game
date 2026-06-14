import { useEffect } from 'react';
import { getCosmeticOfType, isEmote } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { sendEmote } from '../network/colyseus';
import { pushAnimationEvent } from '../render/animation/animationEvents';

/**
 * Number keys (1, 2, …) play the emotes the player has bound in their loadout,
 * in both town and arena. Key N triggers the Nth bound emote (resolving its
 * cosmetic id to an animation). Sends it to the server (so everyone sees it) and
 * pushes it locally for zero-latency local playback. Ignored while typing.
 */
export function useEmotes(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const match = /^Digit([1-9])$/.exec(e.code);
      if (!match) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      // Emotes are bound per class — read the loadout for the class the player is
      // currently in-world as (falling back to the selected class).
      const sid = useGameStore.getState().sessionId;
      const cls =
        (sid ? useGameStore.getState().players.get(sid)?.characterClass : undefined) ??
        useCharacterStore.getState().selectedClass;
      const cosmeticId = useCosmeticsStore.getState().loadoutFor(cls).emotes[Number(match[1]) - 1];
      const anim = cosmeticId ? getCosmeticOfType(cosmeticId, 'emote')?.anim : undefined;
      if (!anim || !isEmote(anim)) return;
      e.preventDefault();
      sendEmote(anim);
      if (sid) pushAnimationEvent(sid, anim);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
