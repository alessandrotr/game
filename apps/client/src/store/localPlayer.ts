/**
 * The local player's *rendered* (client-predicted) transform, published each
 * frame by PlayerEntity and consumed by the camera rig — so the camera tracks
 * the smooth predicted position rather than the laggy server snapshot.
 *
 * Plain mutable singleton: no React state, no per-frame re-renders.
 */
const transform = { x: 0, z: 0, rotation: 0, active: false };

export function setLocalRenderTransform(x: number, z: number, rotation: number): void {
  transform.x = x;
  transform.z = z;
  transform.rotation = rotation;
  transform.active = true;
}

export function clearLocalRenderTransform(): void {
  transform.active = false;
}

export function getLocalRenderTransform(): Readonly<typeof transform> {
  return transform;
}
