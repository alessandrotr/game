/**
 * Deterministic click-to-move pathfinding, shared by the server simulation and
 * the client predictor so both route a move order around cover IDENTICALLY (the
 * same waypoints → no rubber-banding). Grid A* with a line-of-sight shortcut and
 * string-pulling so the result is a few smooth corners, not a zig-zag.
 *
 * Only STATIC cover is routed around (walls, buildings, the pond). Moving bodies
 * (the zombie horde, barrels) are NOT pathed around — they're handled by the
 * collide-and-slide in `stepLocomotion` as the character walks the route, exactly
 * like creeps in a MOBA. Keeping the obstacle set static also keeps the path
 * stable while walking it.
 */

import { PLAYER_RADIUS } from './constants.js';
import type { Circle } from './locomotion.js';

/** Grid resolution (world units). Small enough to find the gaps between cover
 *  (min cover spacing is ~2u, agent ~1u wide), coarse enough to stay cheap. */
const CELL = 1;
/** Search window padding (cells) around the start↔goal box, so a detour has room
 *  to bow out around cover without searching the whole (possibly huge) arena. */
const MARGIN = 12;
/** A* expansion cap — if a route needs more than this, fall back to a straight
 *  line (the slide handles it). Bounds worst-case cost on the big zombie map. */
const MAX_EXPANSIONS = 8000;

const SQRT2 = Math.SQRT2;

export interface PathfindParams {
  /** Static cover circles to route around (NOT moving bodies). */
  obstacles: readonly Circle[];
  /** Play-area half-extents (matches the locomotion clamp). */
  halfBounds: number;
  halfBoundsZ?: number;
  /** Agent radius (defaults to the player radius). */
  agentRadius?: number;
}

const cellOf = (v: number): number => Math.round(v / CELL);
const worldOf = (c: number): number => c * CELL;
/** Stable key for a cell (supports negative indices; |c| < 100000). */
const keyOf = (cx: number, cz: number): number => (cx + 100000) * 1000000 + (cz + 100000);

/** Squared distance from point (px,pz) to segment a→b. */
function segDistSq(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  return ex * ex + ez * ez;
}

/** True if the straight segment a→b stays clear of every (inflated) obstacle. */
function clearLine(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  obstacles: readonly Circle[],
  agentRadius: number,
): boolean {
  for (const o of obstacles) {
    if (o.noRoute) continue; // slide-past object (e.g. chest) — not routed around
    const r = o.radius + agentRadius;
    if (segDistSq(o.x, o.z, ax, az, bx, bz) < r * r) return false;
  }
  return true;
}

/** True if a cell's centre is blocked (out of bounds or inside inflated cover). */
function cellBlocked(
  cx: number,
  cz: number,
  obstacles: readonly Circle[],
  hbX: number,
  hbZ: number,
  agentRadius: number,
): boolean {
  const x = worldOf(cx);
  const z = worldOf(cz);
  if (x < -hbX || x > hbX || z < -hbZ || z > hbZ) return true;
  for (const o of obstacles) {
    if (o.noRoute) continue; // slide-past object (e.g. chest) — not routed around
    const dx = x - o.x;
    const dz = z - o.z;
    const r = o.radius + agentRadius;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

interface Node {
  cx: number;
  cz: number;
  g: number;
  f: number;
  parent: Node | null;
  seq: number;
}

/** Min-heap of A* nodes, ordered by f then insertion order (deterministic). */
class Heap {
  private a: Node[] = [];
  get size(): number {
    return this.a.length;
  }
  push(n: Node): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(a[i]!, a[p]!)) {
        [a[i], a[p]] = [a[p]!, a[i]!];
        i = p;
      } else break;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}
const less = (x: Node, y: Node): boolean => (x.f !== y.f ? x.f < y.f : x.seq < y.seq);

/** Octile heuristic (8-connected grid). */
function heuristic(cx: number, cz: number, gx: number, gz: number): number {
  const dx = Math.abs(cx - gx);
  const dz = Math.abs(cz - gz);
  return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
}

// Neighbour offsets — fixed order (deterministic). Orthogonal first, then diagonal.
const NB: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * A route from (sx,sz) to (gx,gz) that avoids static cover, as smoothed waypoints
 * (world coords), EXCLUDING the start and ending at the goal (or the nearest
 * reachable point if the goal is inside cover). Returns `[goal]` when the straight
 * line is already clear — the overwhelmingly common case — so A* only runs for a
 * move order that's actually behind something.
 */
export function findPath(
  sx: number,
  sz: number,
  gx: number,
  gz: number,
  p: PathfindParams,
): { x: number; z: number }[] {
  const agentRadius = p.agentRadius ?? PLAYER_RADIUS;
  const hbX = p.halfBounds;
  const hbZ = p.halfBoundsZ ?? p.halfBounds;
  const obstacles = p.obstacles;

  // Fast path: clear shot to the goal → walk straight there.
  if (clearLine(sx, sz, gx, gz, obstacles, agentRadius)) return [{ x: gx, z: gz }];

  const sCx = cellOf(sx);
  const sCz = cellOf(sz);
  let gCx = cellOf(gx);
  let gCz = cellOf(gz);

  // If the goal cell is inside cover, aim for the nearest free cell around it so a
  // click on/behind a wall still routes the player up to the wall's edge.
  if (cellBlocked(gCx, gCz, obstacles, hbX, hbZ, agentRadius)) {
    const free = nearestFreeCell(gCx, gCz, obstacles, hbX, hbZ, agentRadius);
    if (!free) return [{ x: gx, z: gz }]; // nowhere better — let the slide handle it
    gCx = free.cx;
    gCz = free.cz;
  }

  // Search window: the start↔goal box padded by MARGIN, clamped to the arena.
  const minCx = Math.max(cellOf(-hbX), Math.min(sCx, gCx) - MARGIN);
  const maxCx = Math.min(cellOf(hbX), Math.max(sCx, gCx) + MARGIN);
  const minCz = Math.max(cellOf(-hbZ), Math.min(sCz, gCz) - MARGIN);
  const maxCz = Math.min(cellOf(hbZ), Math.max(sCz, gCz) + MARGIN);
  const inWindow = (cx: number, cz: number): boolean =>
    cx >= minCx && cx <= maxCx && cz >= minCz && cz <= maxCz;

  const open = new Heap();
  const best = new Map<number, number>(); // cellKey → best g seen
  let seq = 0;
  const start: Node = { cx: sCx, cz: sCz, g: 0, f: heuristic(sCx, sCz, gCx, gCz), parent: null, seq: seq++ };
  open.push(start);
  best.set(keyOf(sCx, sCz), 0);

  let goalNode: Node | null = null;
  let expansions = 0;
  while (open.size > 0 && expansions < MAX_EXPANSIONS) {
    const cur = open.pop();
    if (cur.cx === gCx && cur.cz === gCz) {
      goalNode = cur;
      break;
    }
    const curKey = keyOf(cur.cx, cur.cz);
    if (cur.g > (best.get(curKey) ?? Infinity)) continue; // stale heap entry
    expansions++;
    for (const [dx, dz, cost] of NB) {
      const nx = cur.cx + dx;
      const nz = cur.cz + dz;
      if (!inWindow(nx, nz)) continue;
      if (cellBlocked(nx, nz, obstacles, hbX, hbZ, agentRadius)) continue;
      // Don't cut a diagonal through a blocked corner (would clip a wall).
      if (dx !== 0 && dz !== 0) {
        if (cellBlocked(cur.cx + dx, cur.cz, obstacles, hbX, hbZ, agentRadius)) continue;
        if (cellBlocked(cur.cx, cur.cz + dz, obstacles, hbX, hbZ, agentRadius)) continue;
      }
      const ng = cur.g + cost;
      const nKey = keyOf(nx, nz);
      if (ng >= (best.get(nKey) ?? Infinity)) continue;
      best.set(nKey, ng);
      open.push({ cx: nx, cz: nz, g: ng, f: ng + heuristic(nx, nz, gCx, gCz), parent: cur, seq: seq++ });
    }
  }

  if (!goalNode) return [{ x: gx, z: gz }]; // no route found — fall back to direct

  // Reconstruct the cell path (start → goal).
  const cells: { x: number; z: number }[] = [];
  for (let n: Node | null = goalNode; n; n = n.parent) cells.push({ x: worldOf(n.cx), z: worldOf(n.cz) });
  cells.reverse();

  // String-pull: keep only corners where the straight line would clip cover.
  const pulled: { x: number; z: number }[] = [{ x: sx, z: sz }];
  let anchor = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = pulled[pulled.length - 1]!;
    const next = cells[i]!;
    if (!clearLine(a.x, a.z, next.x, next.z, obstacles, agentRadius)) {
      pulled.push(cells[i - 1]!); // the last cell that WAS visible becomes a corner
      anchor = i - 1;
    }
  }
  void anchor;
  // End at the real click point if we can see it from the last corner; else the
  // nearest-free goal cell we routed to.
  const lastCorner = pulled[pulled.length - 1]!;
  if (clearLine(lastCorner.x, lastCorner.z, gx, gz, obstacles, agentRadius)) {
    pulled.push({ x: gx, z: gz });
  } else {
    pulled.push(cells[cells.length - 1]!);
  }

  pulled.shift(); // drop the start; return only the waypoints to walk to
  return pulled;
}

/**
 * Mutable per-mover path-follow state. The client predictor and the server each
 * keep one and drive it with {@link nextWaypoint}, so both walk the same route.
 */
export interface PathState {
  pts: { x: number; z: number }[];
  idx: number;
  goalX: number;
  goalZ: number;
  has: boolean;
  /** For throttled AI chase repathing: the next sim time a recompute is allowed. */
  repathAt?: number;
}

/** True when the straight line a→b is clear of routed cover (no detour needed). */
export function lineOfSightClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  p: PathfindParams,
): boolean {
  return clearLine(ax, az, bx, bz, p.obstacles, p.agentRadius ?? PLAYER_RADIUS);
}

export function emptyPathState(): PathState {
  return { pts: [], idx: 0, goalX: 0, goalZ: 0, has: false };
}

export function clearPathState(s: PathState): void {
  s.pts = [];
  s.idx = 0;
  s.has = false;
}

/** Re-path when the goal jumps more than this (a new click / drag-steer move). */
const REPATH_DIST = 0.75;
/** Advance to the next waypoint once this close to the current one. Comfortably
 *  above the stopping distance so the mover glides through corners, not stops. */
const ADVANCE_DIST = 0.6;

/**
 * The point the mover should currently steer toward, given its position, the move
 * goal, and its {@link PathState}. (Re)computes the route when the goal changes,
 * advances past reached corners, and returns the active waypoint (the final one is
 * the goal). Feed the result to `stepLocomotion` as its destination.
 */
export function nextWaypoint(
  posX: number,
  posZ: number,
  goalX: number,
  goalZ: number,
  state: PathState,
  params: PathfindParams,
): { x: number; z: number } {
  if (!state.has || Math.hypot(goalX - state.goalX, goalZ - state.goalZ) > REPATH_DIST) {
    state.pts = findPath(posX, posZ, goalX, goalZ, params);
    state.idx = 0;
    state.goalX = goalX;
    state.goalZ = goalZ;
    state.has = true;
  }
  while (state.idx < state.pts.length - 1) {
    const w = state.pts[state.idx]!;
    if (Math.hypot(posX - w.x, posZ - w.z) <= ADVANCE_DIST) state.idx += 1;
    else break;
  }
  return state.pts[state.idx] ?? { x: goalX, z: goalZ };
}

/** True when the mover is steering toward the final waypoint (the goal itself). */
export function onFinalWaypoint(state: PathState): boolean {
  return state.idx >= state.pts.length - 1;
}

/**
 * Chase variant of {@link nextWaypoint} for AI (zombies/bots) following a MOVING
 * target through cover. Recomputes the route at most every `repathMs` (the target
 * moves continuously, so a per-frame repath would be far too costly with a big
 * horde), advancing along the cached route in between. Use only when the straight
 * line to the target is blocked — open-field chasing should steer directly.
 */
export function nextWaypointThrottled(
  posX: number,
  posZ: number,
  goalX: number,
  goalZ: number,
  state: PathState,
  params: PathfindParams,
  now: number,
  repathMs: number,
): { x: number; z: number } {
  if (!state.has || now >= (state.repathAt ?? 0)) {
    state.pts = findPath(posX, posZ, goalX, goalZ, params);
    state.idx = 0;
    state.goalX = goalX;
    state.goalZ = goalZ;
    state.has = true;
    state.repathAt = now + repathMs;
  }
  while (state.idx < state.pts.length - 1) {
    const w = state.pts[state.idx]!;
    if (Math.hypot(posX - w.x, posZ - w.z) <= ADVANCE_DIST) state.idx += 1;
    else break;
  }
  return state.pts[state.idx] ?? { x: goalX, z: goalZ };
}

/** Breadth-first ring search for the nearest non-blocked cell to (cx,cz). */
function nearestFreeCell(
  cx: number,
  cz: number,
  obstacles: readonly Circle[],
  hbX: number,
  hbZ: number,
  agentRadius: number,
): { cx: number; cz: number } | null {
  for (let radius = 1; radius <= 24; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue; // ring only
        const nx = cx + dx;
        const nz = cz + dz;
        if (!cellBlocked(nx, nz, obstacles, hbX, hbZ, agentRadius)) return { cx: nx, cz: nz };
      }
    }
  }
  return null;
}
