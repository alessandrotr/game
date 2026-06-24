import { useAbilityTargeting } from '../../store/abilityTargeting';
import { getCursorGround } from '../../store/cursorState';
import { getLocalRenderTransform } from '../../store/localPlayer';
import { useGameStore } from '../../store/useGameStore';

/** The ability a player is AIMING (charging) and the live aim yaw. Drives the
 *  "charge / wind-up" weapon pose shown while a hold-to-aim ability is charged. */
export interface AimState {
  ability: string;
  yaw: number;
}

/**
 * Charge/aim state for a player, or null. For the LOCAL player it reads the held
 * key + live cursor (zero latency). For REMOTE players it reads the replicated
 * `chargeAbility`/`chargeDir` (set on the server while they hold a hold-to-aim
 * ability), so everyone sees the wind-up before a cast.
 */
export function getAim(ownerId?: string): AimState | null {
  if (!ownerId) return null;
  if (ownerId === useGameStore.getState().sessionId) {
    const pending = useAbilityTargeting.getState().pending;
    if (!pending) return null;
    const tr = getLocalRenderTransform();
    const cur = getCursorGround();
    const dx = cur.x - tr.x;
    const dz = cur.z - tr.z;
    const len = Math.hypot(dx, dz);
    return { ability: pending, yaw: len > 1e-3 ? Math.atan2(dx, dz) : tr.rotation };
  }
  const p = useGameStore.getState().players.get(ownerId);
  if (!p || !p.alive || !p.chargeAbility) return null;
  return { ability: p.chargeAbility, yaw: Math.atan2(p.chargeDirX, p.chargeDirZ) };
}
