import { useAbilityTargeting } from '../../store/abilityTargeting';
import { getCursorGround } from '../../store/cursorState';
import { getLocalRenderTransform } from '../../store/localPlayer';
import { useGameStore } from '../../store/useGameStore';

/** The ability the local player is currently AIMING (holding the key for) and the
 *  live aim yaw toward the cursor. Drives the "charge / wind-up" weapon pose that
 *  plays while a hold-to-aim ability is charged, before it fires on release. */
export interface AimState {
  ability: string;
  yaw: number;
}

/**
 * Local-player aiming state, or null. Only the local player has held-key state
 * (remotes animate from the fire event), so this returns null for anyone else.
 * `aim: 'direction' | 'point'` abilities set `pending` on key-down and clear it on
 * release/cancel — so a non-null result means a chargeable ability is being held.
 */
export function getLocalAim(ownerId?: string): AimState | null {
  if (!ownerId || ownerId !== useGameStore.getState().sessionId) return null;
  const pending = useAbilityTargeting.getState().pending;
  if (!pending) return null;
  const tr = getLocalRenderTransform();
  const cur = getCursorGround();
  const dx = cur.x - tr.x;
  const dz = cur.z - tr.z;
  const len = Math.hypot(dx, dz);
  return { ability: pending, yaw: len > 1e-3 ? Math.atan2(dx, dz) : tr.rotation };
}
