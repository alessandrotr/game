import { useEffect } from 'react';
import { useTuningStore } from '../tuning/useTuningStore';
import { sendDevTune } from '../network/colyseus';

/**
 * Dev-only: streams the Player movement tuning (walk/sprint/jump) to the
 * authoritative server so Leva edits apply live to the real simulation. The
 * server is still the source of truth — this just lets it be tuned at runtime.
 * Stripped from production builds via `import.meta.env.DEV`.
 */
export function useServerMovementTuning(connected: boolean): void {
  useEffect(() => {
    if (!connected || !import.meta.env.DEV) return;

    let last = '';
    const push = () => {
      const p = useTuningStore.getState().values.player;
      const next = {
        walkSpeed: p.walkSpeed,
        sprintSpeed: p.sprintSpeed,
        jumpForce: p.jumpForce,
        sprintThreshold: p.sprintThreshold,
        stoppingDistance: p.stoppingDistance,
        rotationSpeed: p.rotationSpeed,
      };
      const key = Object.values(next).join('|');
      if (key === last) return;
      last = key;
      sendDevTune(next);
    };

    push(); // sync current values on connect
    return useTuningStore.subscribe(push); // and on every subsequent edit
  }, [connected]);
}
