import { useEffect } from 'react';
import type { ClientMessage, ClientMessagePayloads } from '@arena/shared';
import { getMovementFeel, useTuningStore } from '../tuning';
import { sendDevTune } from '../network/colyseus';

/**
 * Dev-only: streams the global movement "feel" (sprint multiplier, jump, turn,
 * stop, sprint threshold) to the authoritative server so Leva edits apply live.
 * Per-class walk speed travels via the stat-tuning hook. Stripped from prod via
 * `import.meta.env.DEV`.
 */
export function useServerMovementTuning(connected: boolean): void {
  useEffect(() => {
    if (!connected || !import.meta.env.DEV) return;

    let last = '';
    const push = () => {
      const m = getMovementFeel();
      const next: ClientMessagePayloads[ClientMessage.DevTune] = {
        jumpForce: m.jumpForce,
        stoppingDistance: m.stoppingDistance,
        rotationSpeed: m.rotationSpeed,
      };
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      sendDevTune(next);
    };

    push(); // sync current values on connect
    return useTuningStore.subscribe(push); // and on every subsequent edit
  }, [connected]);
}
