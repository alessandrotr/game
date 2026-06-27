import { describe, expect, it } from 'vitest';
import { findPath, PLAYER_RADIUS, type Circle } from '@arena/shared';

const params = (obstacles: Circle[]) => ({ obstacles, halfBounds: 50, halfBoundsZ: 50 });

/** Squared distance from point to segment a→b. */
function segDistSq(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax,
    dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t,
    cz = az + dz * t;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

/** Assert a start→waypoints polyline never clips any obstacle (minus a tiny eps). */
function polylineClear(sx: number, sz: number, pts: { x: number; z: number }[], obstacles: Circle[]) {
  let ax = sx,
    az = sz;
  for (const p of pts) {
    for (const o of obstacles) {
      const r = o.radius + PLAYER_RADIUS - 0.05; // small tolerance for grid rounding
      expect(segDistSq(o.x, o.z, ax, az, p.x, p.z)).toBeGreaterThanOrEqual(r * r);
    }
    ax = p.x;
    az = p.z;
  }
}

describe('findPath', () => {
  it('returns a straight shot when nothing is in the way', () => {
    const pts = findPath(-10, 0, 10, 0, params([]));
    expect(pts).toEqual([{ x: 10, z: 0 }]);
  });

  it('routes around a wall between start and goal', () => {
    // A line of circles forming a wall across x=0 from z=-4..4.
    const wall: Circle[] = [];
    for (let z = -4; z <= 4; z++) wall.push({ x: 0, z, radius: 0.6 });
    const pts = findPath(-10, 0, 10, 0, params(wall));
    expect(pts.length).toBeGreaterThan(1); // had to detour, not a straight line
    // The detour reaches the goal and never clips the wall.
    expect(pts[pts.length - 1]).toEqual({ x: 10, z: 0 });
    polylineClear(-10, 0, pts, wall);
  });

  it('is deterministic (same inputs → identical route)', () => {
    const wall: Circle[] = [];
    for (let z = -4; z <= 4; z++) wall.push({ x: 0, z, radius: 0.6 });
    const a = findPath(-10, 0, 10, 0, params(wall));
    const b = findPath(-10, 0, 10, 0, params(wall));
    expect(a).toEqual(b);
  });

  it('routes up to a wall when the goal itself is inside cover', () => {
    const wall: Circle[] = [];
    for (let z = -4; z <= 4; z++) wall.push({ x: 0, z, radius: 0.6 });
    // Goal sits inside the wall — should still return a reachable polyline.
    const pts = findPath(-10, 0, 0, 0, params(wall));
    expect(pts.length).toBeGreaterThan(0);
    polylineClear(-10, 0, pts, wall);
  });
});
