/**
 * User-controlled camera yaw + pitch offsets (radians), layered on top of the
 * fixed follow-camera's per-team base orientation. Middle-mouse drag and the
 * arrow keys adjust them; a middle-click recenters. Plain mutable singleton read
 * each frame by `CameraRig` — no React re-renders.
 */
/** Max up/down tilt the user can add, in radians (~14° — deliberately small so
 *  the view never goes flat or fully top-down). */
const MAX_PITCH_OFFSET = 0.25;

/** Tilt is fixed for now at the lowest position (flattest, lowest camera Y); the
 *  in-game tilt controls and the Settings lock toggles are disabled. */
const FIXED_PITCH_OFFSET = -MAX_PITCH_OFFSET;

let yawOffset = 0;
let pitchOffset = FIXED_PITCH_OFFSET;
let zoom = 1;
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

/** Tilt is fixed at the lowest position for now — this is a no-op. */
export function addCameraPitch(_delta: number): void {
  /* disabled: camera tilt is locked to the lowest Y */
}

export function getCameraZoom(): number {
  return zoom;
}

/** Adjust the zoom (radius) multiplier, clamped to a gentle range. */
export function addCameraZoom(delta: number): void {
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
}

/** Snap back to the default (per-team) orientation and zoom; tilt stays fixed. */
export function resetCameraView(): void {
  yawOffset = 0;
  pitchOffset = FIXED_PITCH_OFFSET;
  zoom = 1;
}

export function resetCameraYaw(): void {
  yawOffset = 0;
}

export function resetCameraZoom(): void {
  zoom = 1;
}

/** No-op while tilt is fixed at the lowest position (the lock prefs don't apply). */
export function clampCameraPitch(_allowUp: boolean, _allowDown: boolean): void {
  /* disabled: camera tilt is locked to the lowest Y */
}
