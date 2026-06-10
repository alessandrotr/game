/**
 * The cursor's projected point on the ground plane, updated every frame by
 * `CursorTracker`. Used by ability aiming (skillshot direction / ground target)
 * and its on-ground indicator. Plain mutable singleton — no React re-renders.
 */
const cursor = { x: 0, z: 0, active: false };

export function setCursorGround(x: number, z: number): void {
  cursor.x = x;
  cursor.z = z;
  cursor.active = true;
}

export function getCursorGround(): Readonly<typeof cursor> {
  return cursor;
}
