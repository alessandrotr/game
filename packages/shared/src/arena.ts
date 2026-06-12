/**
 * Procedural arena layout — every match gets a fresh, randomized-but-sensible
 * scattering of cover across the WHOLE ground (the old layout clustered
 * everything in the middle). The server picks a seed per match and syncs it; the
 * client and the server both rebuild the identical layout from that seed, so a
 * single generator is the one source of truth for BOTH the collision circles and
 * the visible props (no more hand-keeping two lists in sync).
 *
 * Placement is laid out with 180° rotational symmetry — each piece is mirrored
 * through the center to (−x, −z) — so neither side of the arena has an advantage
 * while the layout still differs every match.
 */

import { ARENA_HALF_SIZE, ARENA_SPAWN_POINTS, type ArenaObstacle } from './constants.js';
import type { MapProp, PropAssetId } from './assets.js';

/** Fallback seed for the brief moment before the server's seed has synced. */
export const DEFAULT_ARENA_SEED = 1;

/** The full generated layout: collision circles + the props that visualize them. */
export interface GeneratedArenaLayout {
  obstacles: ArenaObstacle[];
  props: MapProp[];
}

// --- Placement constraints (world units) ---
const MARGIN = 3; // keep objects this far inside the walls
const MAX_R = ARENA_HALF_SIZE - MARGIN; // outer bound for object centers
const SPAWN_CLEAR = 5; // keep cover away from every spawn point
const PORTAL = { x: 0, z: -ARENA_HALF_SIZE + 2 }; // town portal (and its mirror)
const PORTAL_CLEAR = 4;
const GAP = 2; // minimum breathing room between footprints

/** A kind of cover: a visible prop with a collision footprint. */
interface CoverKind {
  assetId: PropAssetId;
  radius: number;
  height: number;
  count: number; // per side (doubled by the mirror)
  cluster?: number; // emit N props huddled in one circle (drum piles)
}

/** A decorative kind: placed for flavor, no collision (footprint is spacing only). */
interface DecorKind {
  assetId: PropAssetId;
  foot: number;
  count: number;
}

const COVER: CoverKind[] = [
  { assetId: 'prop.arena.trailer', radius: 2, height: 2.8, count: 2 },
  { assetId: 'prop.arena.trailer.teal', radius: 2, height: 2.8, count: 1 },
  { assetId: 'prop.arena.car.burned', radius: 1.6, height: 1.7, count: 1 },
  { assetId: 'prop.arena.dumpster', radius: 1.3, height: 1.5, count: 1 },
  { assetId: 'prop.arena.scrap', radius: 1.2, height: 1.4, count: 1 },
  { assetId: 'prop.arena.drum', radius: 1.1, height: 1, count: 1, cluster: 3 },
  { assetId: 'prop.arena.drum.fire', radius: 0.5, height: 1, count: 2 }, // burning barrels (drive the fire lights)
  { assetId: 'prop.arena.drum', radius: 0.5, height: 1, count: 2 }, // loose drums
];

const DECOR: DecorKind[] = [
  { assetId: 'prop.arena.tires', foot: 1.2, count: 2 },
  { assetId: 'prop.arena.trash', foot: 1.2, count: 3 },
  { assetId: 'prop.arena.crate.broken', foot: 1.2, count: 2 },
  { assetId: 'prop.arena.debris', foot: 1.0, count: 3 },
  { assetId: 'prop.arena.fence.rust', foot: 1.5, count: 2 },
];

/** Deterministic PRNG (mulberry32) — same sequence on server and client per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cache: { seed: number; layout: GeneratedArenaLayout } | null = null;

/**
 * Build the arena layout for `seed`. Pure and memoized on the last seed, so the
 * renderer, the predictor, and the server can all call it freely.
 */
export function generateArenaLayout(seed: number): GeneratedArenaLayout {
  const s = seed >>> 0 || DEFAULT_ARENA_SEED;
  if (cache && cache.seed === s) return cache.layout;

  const rng = mulberry32(s);
  const obstacles: ArenaObstacle[] = [];
  const props: MapProp[] = [];
  /** Footprints already taken (includes mirrors) for separation checks. */
  const taken: { x: number; z: number; r: number }[] = [];

  const farFromSpawns = (x: number, z: number, fr: number) =>
    ARENA_SPAWN_POINTS.every((sp) => Math.hypot(x - sp.x, z - sp.z) >= SPAWN_CLEAR + fr);
  const farFromPortal = (x: number, z: number, fr: number) =>
    Math.hypot(x - PORTAL.x, z - PORTAL.z) >= PORTAL_CLEAR + fr &&
    Math.hypot(x + PORTAL.x, z + PORTAL.z) >= PORTAL_CLEAR + fr;
  const farFromTaken = (x: number, z: number, fr: number) =>
    taken.every((t) => Math.hypot(x - t.x, z - t.z) >= t.r + fr + GAP);

  /** Find a symmetric-safe spot for footprint `fr`, or null after N tries. */
  function findSpot(fr: number): { x: number; z: number } | null {
    for (let i = 0; i < 40; i++) {
      const x = (rng() * 2 - 1) * MAX_R;
      const z = (rng() * 2 - 1) * MAX_R;
      // Keep clear of the center so a piece can't overlap its own mirror.
      if (Math.hypot(x, z) < fr + GAP) continue;
      if (!farFromSpawns(x, z, fr) || !farFromPortal(x, z, fr)) continue;
      // Both the piece and its mirror must clear everything placed so far.
      if (!farFromTaken(x, z, fr) || !farFromTaken(-x, -z, fr)) continue;
      taken.push({ x, z, r: fr }, { x: -x, z: -z, r: fr });
      return { x, z };
    }
    return null;
  }

  // Cover: collidable props, mirrored for fairness.
  for (const kind of COVER) {
    for (let n = 0; n < kind.count; n++) {
      const spot = findSpot(kind.radius);
      if (!spot) continue;
      const rot = rng() * Math.PI * 2;
      placeCover(props, obstacles, kind, spot.x, spot.z, rot, rng);
      placeCover(props, obstacles, kind, -spot.x, -spot.z, rot + Math.PI, rng);
    }
  }

  // Decorative scatter: no collision, just lived-in clutter (also mirrored).
  for (const kind of DECOR) {
    for (let n = 0; n < kind.count; n++) {
      const spot = findSpot(kind.foot);
      if (!spot) continue;
      const rot = rng() * Math.PI * 2;
      props.push({ assetId: kind.assetId, position: [spot.x, 0, spot.z], rotation: [0, rot, 0] });
      props.push({ assetId: kind.assetId, position: [-spot.x, 0, -spot.z], rotation: [0, rot + Math.PI, 0] });
    }
  }

  const layout: GeneratedArenaLayout = { obstacles, props };
  cache = { seed: s, layout };
  return layout;
}

/** Emit one cover piece's collision circle + visible prop(s) at (x,z). */
function placeCover(
  props: MapProp[],
  obstacles: ArenaObstacle[],
  kind: CoverKind,
  x: number,
  z: number,
  rot: number,
  rng: () => number,
): void {
  obstacles.push({ x, z, radius: kind.radius, height: kind.height });
  if (kind.cluster) {
    // A huddle of N props sitting inside the one collision circle.
    for (let i = 0; i < kind.cluster; i++) {
      const a = rot + (i / kind.cluster) * Math.PI * 2;
      const d = kind.radius * 0.45;
      props.push({
        assetId: kind.assetId,
        position: [x + Math.cos(a) * d, 0, z + Math.sin(a) * d],
        rotation: [0, rng() * Math.PI * 2, 0],
      });
    }
  } else {
    props.push({ assetId: kind.assetId, position: [x, 0, z], rotation: [0, rot, 0] });
  }
}

/**
 * Push a point out of any overlapping obstacle circle so it rests on the edge —
 * the per-match arena collider. Same circle-vs-circle resolution the static
 * `collideArenaObstacles` uses, but against a caller-supplied set (this match's
 * generated obstacles) rather than the global constant.
 */
export function collideObstacles(
  x: number,
  z: number,
  obstacles: readonly ArenaObstacle[],
  playerRadius: number,
): { x: number; z: number } {
  for (const o of obstacles) {
    const dx = x - o.x;
    const dz = z - o.z;
    const min = o.radius + playerRadius;
    const distSq = dx * dx + dz * dz;
    if (distSq < min * min && distSq > 1e-6) {
      const d = Math.sqrt(distSq);
      x = o.x + (dx / d) * min;
      z = o.z + (dz / d) * min;
    }
  }
  return { x, z };
}
