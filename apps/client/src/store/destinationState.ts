/**
 * The local player's current move destination, used for client-side prediction
 * and the on-ground marker. Plain mutable singleton (no React state) so it can
 * be read/written every frame without re-renders.
 *
 * The server is authoritative for movement; this mirror is for responsive local
 * prediction and visual feedback. Single move speed (no sprint flag).
 */
const destination = { x: 0, z: 0, active: false };

export function setDestination(x: number, z: number): void {
  destination.x = x;
  destination.z = z;
  destination.active = true;
}

export function clearDestination(): void {
  destination.active = false;
}

export function getDestination(): Readonly<typeof destination> {
  return destination;
}
