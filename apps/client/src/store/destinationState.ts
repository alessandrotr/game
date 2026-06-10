/**
 * The local player's current move destination, used for client-side prediction
 * and the on-ground marker. Plain mutable singleton (no React state) so it can
 * be read/written every frame without re-renders.
 *
 * `sprint` is decided when the destination is set and held constant for the
 * whole trip (matches the server), so speed doesn't ramp down near the mark.
 * The server is authoritative for movement; this mirror is for responsive
 * local prediction and visual feedback.
 */
const destination = { x: 0, z: 0, sprint: false, active: false };

export function setDestination(x: number, z: number, sprint: boolean): void {
  destination.x = x;
  destination.z = z;
  destination.sprint = sprint;
  destination.active = true;
}

export function clearDestination(): void {
  destination.active = false;
}

export function getDestination(): Readonly<typeof destination> {
  return destination;
}
