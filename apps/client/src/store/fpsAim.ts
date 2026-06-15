/**
 * First-person look angles for Gun Mode Zombie, driven by pointer-locked
 * mouse-look. Plain mutable singleton read every frame by the camera, the local
 * body rotation, and the fire/aim sends — no React re-renders.
 *
 * `yaw` matches the game's facing convention: the forward ground direction is
 * `(sin(yaw), cos(yaw))`, so `yaw` is written straight to `Player.rotation`.
 * `pitch` only tilts the camera look (bullets travel on the ground plane), and is
 * clamped so the view never flips over.
 */
const aim = { yaw: 0, pitch: 0 };

/** Clamp on the up/down look so the camera can't roll past straight up/down. */
const MAX_PITCH = 1.2;

/** True once the player has pointer-locked at least once (so the camera/body
 *  start tracking mouse-look rather than the last server rotation). */
let engaged = false;

export function getFpsAim(): Readonly<typeof aim> {
  return aim;
}

export function isFpsEngaged(): boolean {
  return engaged;
}

/** Seed the yaw from the player's current facing (called when pointer lock is
 *  first acquired) so the view doesn't snap. */
export function seedFpsYaw(yaw: number): void {
  aim.yaw = yaw;
  aim.pitch = 0;
  engaged = true;
}

/** Apply a mouse-look delta (raw pointer movement, already scaled). */
export function addFpsLook(dYaw: number, dPitch: number): void {
  aim.yaw += dYaw;
  aim.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, aim.pitch + dPitch));
}

/** Reset on leaving gun mode so a future run starts clean. */
export function resetFpsAim(): void {
  aim.yaw = 0;
  aim.pitch = 0;
  engaged = false;
}
