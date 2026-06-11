import { useEffect } from 'react';
import type { ClientMessage, ClientMessagePayloads } from '@arena/shared';
import { useTuningStore } from '../tuning';
import { sendAbilityTune } from '../network/colyseus';

/**
 * Dev-only: streams ability balance overrides to the authoritative server —
 * `global` patches the shared base, `perClass` patches a class's copy. Values
 * are already in the server's units (ms, world units), so no conversion: the
 * store holds the same `AbilityConfig` shape. Stripped from prod via
 * `import.meta.env.DEV`.
 */
export function useServerAbilityTuning(connected: boolean): void {
  useEffect(() => {
    if (!connected || !import.meta.env.DEV) return;

    let last = '';
    const push = () => {
      const { abilityBase, classAbilities } = useTuningStore.getState().overrides;
      const payload: ClientMessagePayloads[ClientMessage.AbilityTune] = {};
      if (abilityBase) payload.global = abilityBase;
      if (classAbilities) payload.perClass = classAbilities;
      const key = JSON.stringify(payload);
      if (key === last) return;
      last = key;
      sendAbilityTune(payload);
    };

    push(); // sync current overrides on connect
    return useTuningStore.subscribe(push); // and on every subsequent edit
  }, [connected]);
}
