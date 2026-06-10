import { useEffect } from 'react';
import type {
  AbilityConfig,
  AbilityKind,
  ClientMessage,
  ClientMessagePayloads,
} from '@arena/shared';
import { useTuningStore } from '../tuning/useTuningStore';
import type { AbilityId, AbilityTuning } from '../tuning/defaults';
import { sendAbilityTune } from '../network/colyseus';

/**
 * Dev-only: streams the Leva combat-panel ability balance to the authoritative
 * server so edits apply live to the real simulation (Phase 6.2). The server
 * stays the source of truth — this only feeds it overrides.
 *
 * Translates the panel's friendly units (seconds, generic "distance") into the
 * server's `AbilityConfig` units (milliseconds, per-ability field). Stripped
 * from production builds via `import.meta.env.DEV`.
 */
function toServerConfig(id: AbilityId, t: AbilityTuning): Partial<AbilityConfig> {
  const out: Partial<AbilityConfig> = {};
  if (t.damage != null) out.damage = t.damage;
  if (t.cooldown != null) out.cooldownMs = t.cooldown * 1000;
  if (t.manaCost != null) out.manaCost = t.manaCost;
  if (t.castTime != null) out.castTimeMs = t.castTime * 1000;
  if (t.projectileSpeed != null) out.projectileSpeed = t.projectileSpeed;
  if (t.aoeRadius != null) out.aoeRadius = t.aoeRadius;
  if (t.amount != null) out.healAmount = t.amount;
  if (t.distance != null) {
    // "Distance" is the dash length for charge, and the teleport/strike reach
    // (the `range` field) for everything else.
    if (id === 'charge') out.dashDistance = t.distance;
    else out.range = t.distance;
  }
  return out;
}

export function useServerAbilityTuning(connected: boolean): void {
  useEffect(() => {
    if (!connected || !import.meta.env.DEV) return;

    let last = '';
    const push = () => {
      const abilities = useTuningStore.getState().values.abilities;
      const payload: ClientMessagePayloads[ClientMessage.AbilityTune] = {};
      for (const [id, tuning] of Object.entries(abilities)) {
        payload[id as AbilityKind] = toServerConfig(id as AbilityId, tuning);
      }
      const key = JSON.stringify(payload);
      if (key === last) return;
      last = key;
      sendAbilityTune(payload);
    };

    push(); // sync current values on connect
    return useTuningStore.subscribe(push); // and on every subsequent edit
  }, [connected]);
}
