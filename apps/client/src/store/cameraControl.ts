/**
 * User-controlled camera yaw + pitch offsets (radians), layered on top of the
 * fixed follow-camera's per-team base orientation. Middle-mouse drag and the
 * arrow keys adjust them; a middle-click recenters. Plain mutable singleton read
 * each frame by `CameraRig` — no React re-renders.
 */
let yawOffset = 0;
let pitchOffset = 0;
let zoom = 1;

/** Max up/down tilt the user can add, in radians (~14° — deliberately small so
 *  the view never goes flat or fully top-down). */
const MAX_PITCH_OFFSET = 0.25;
/** Zoom is a radius multiplier, kept to a gentle range. */
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.4;

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

export function getCameraZoom(): number {
  return zoom;
}

/** Adjust the zoom (radius) multiplier, clamped to a gentle range. */
export function addCameraZoom(delta: number): void {
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
}

/** Snap back to the default (per-team) orientation, tilt and zoom. */
export function resetCameraView(): void {
  yawOffset = 0;
  pitchOffset = 0;
  zoom = 1;
}
