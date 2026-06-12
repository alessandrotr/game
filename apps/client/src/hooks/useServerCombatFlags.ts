import { useEffect } from 'react';
import { useCombatFlagsStore } from '../store/useCombatFlagsStore';
import { sendSetAutoAttack } from '../network/colyseus';

/**
 * Pushes the combat feature flags to the authoritative server: once on connect
 * (so a fresh room — which defaults auto-attacks off — matches the local
 * setting) and on every subsequent change. Mirrors the live-tuning hooks.
 */
export function useServerCombatFlags(connected: boolean): void {
  useEffect(() => {
    if (!connected) return;
    let last: boolean | null = null;
    const push = () => {
      const enabled = useCombatFlagsStore.getState().autoAttack;
      if (enabled === last) return;
      last = enabled;
      sendSetAutoAttack(enabled);
    };
    push(); // sync current value on connect
    return useCombatFlagsStore.subscribe(push); // and on every change
  }, [connected]);
}
