import { useEffect } from 'react';
import { useTuningStore } from '../tuning';
import { sendStatTune } from '../network/colyseus';

/**
 * Dev-only: streams per-class stat overrides (HP / mana / move speed / attack)
 * to the authoritative server so Leva edits apply live to the real sim. Stripped
 * from prod via `import.meta.env.DEV`.
 */
export function useServerStatTuning(connected: boolean): void {
  useEffect(() => {
    if (!connected || !import.meta.env.DEV) return;

    let last = '';
    const push = () => {
      const classStats = useTuningStore.getState().overrides.classStats ?? {};
      const key = JSON.stringify(classStats);
      if (key === last) return;
      last = key;
      sendStatTune(classStats);
    };

    push(); // sync current overrides on connect
    return useTuningStore.subscribe(push); // and on every subsequent edit
  }, [connected]);
}
