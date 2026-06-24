import type { Vector3 } from 'three';

/**
 * Live WORLD position of each caster's weapon showpiece (orb / mace head),
 * published every frame by the weapon cast animator while a cast or channel
 * gesture is active. Lets effects originate from the ACTUAL rendered orb —
 * including its cast swing and pitch — instead of a rest-pose approximation, so
 * the priest beam comes exactly out of the scepter from any angle.
 *
 * Non-reactive singleton (mirrors `castAim`): the render loop writes and reads it.
 */
interface Tip {
  x: number;
  y: number;
  z: number;
  /** `performance.now()` of the last write, for staleness checks. */
  t: number;
}

const tips = new Map<string, Tip>();

export function setWeaponTip(sessionId: string, v: Vector3, now: number): void {
  let e = tips.get(sessionId);
  if (!e) {
    e = { x: 0, y: 0, z: 0, t: 0 };
    tips.set(sessionId, e);
  }
  e.x = v.x;
  e.y = v.y;
  e.z = v.z;
  e.t = now;
}

/** The orb world position if it was published within `maxAgeMs`, else null. */
export function getWeaponTip(
  sessionId: string,
  now: number,
  maxAgeMs = 150,
): { x: number; y: number; z: number } | null {
  const e = tips.get(sessionId);
  return e && now - e.t <= maxAgeMs ? e : null;
}

export function clearWeaponTip(sessionId: string): void {
  tips.delete(sessionId);
}
