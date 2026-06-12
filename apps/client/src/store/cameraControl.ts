/**
 * User-controlled camera yaw + pitch offsets (radians), layered on top of the
 * fixed follow-camera's per-team base orientation. Middle-mouse drag and the
 * arrow keys adjust them; a middle-click recenters. Plain mutable singleton read
 * each frame by `CameraRig` — no React re-renders.
 */
let yawOffset = 0;
let pitchOffset = 0;

/** Max up/down tilt the user can add, in radians (~14° — deliberately small so
 *  the view never goes flat or fully top-down). */
const MAX_PITCH_OFFSET = 0.25;

export function getCameraYaw(): number {
  return yawOffset;
}

export function getCameraPitch(): number {
  return pitchOffset;
}

export function addCameraYaw(delta: number): void {
  yawOffset += delta;
}

/** Adjust the up/down tilt, clamped to ±{@link MAX_PITCH_OFFSET}. */
export function addCameraPitch(delta: number): void {
  pitchOffset = Math.min(MAX_PITCH_OFFSET, Math.max(-MAX_PITCH_OFFSET, pitchOffset + delta));
}

/** Snap back to the default (per-team) orientation and tilt. */
export function resetCameraView(): void {
  yawOffset = 0;
  pitchOffset = 0;
}
