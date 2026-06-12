/**
 * User-controlled camera yaw offset (radians), layered on top of the fixed
 * follow-camera's per-team base orientation. Middle-mouse drag rotates it; a
 * middle-click recenters it. Plain mutable singleton read each frame by
 * `CameraRig` — no React re-renders.
 */
let yawOffset = 0;

export function getCameraYaw(): number {
  return yawOffset;
}

export function addCameraYaw(delta: number): void {
  yawOffset += delta;
}

/** Snap back to the default (per-team) orientation. */
export function resetCameraYaw(): void {
  yawOffset = 0;
}
