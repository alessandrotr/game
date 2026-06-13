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

/** The full generated layout: collision circles, the props that visualize them,
 *  and the interactive burning-barrel spawn points. */
export interface GeneratedArenaLayout {
  obstacles: ArenaObstacle[];
  props: MapProp[];
  /** Burning-barrel positions — the server promotes these to live, destructible
   *  `Barrel` entities (they're NOT static obstacles or props). */
  barrels: { x: number; z: number }[];
  /** Oil-drum positions — the server promotes these to destructible, roll-away
   *  drums (they're NOT static obstacles or props, and they don't explode). */
  drums: { x: number; z: number }[];
  /** Tire-stack centers — the server spawns a destructible 3-tire pile at each
   *  (separate physical tires; NOT static props). */
  tireStacks: { x: number; z: number }[];
  /** HP-bearing cover structures (trailers="houses", cars, dumpsters). The
   *  server promotes these to replicated `CoverStructure` entities with HP that
   *  crumble (and become uncollidable) when destroyed. NOT static obstacles/props. */
  structures: CoverStructureSpec[];
}

/** A destructible cover structure's spawn descriptor (placed by the layout, then
 *  promoted to a replicated entity by the server). */
export interface CoverStructureSpec {
  assetId: PropAssetId;
  x: number;
  z: number;
  /** Yaw (radians) the prop is rendered at. */
  rotation: number;
  /** Collision footprint radius + visual height (also drive the size→HP scale). */
  radius: number;
  height: number;
  maxHp: number;
}

/** The largest cover ("house"/trailer) caps out here; everything else scales
 *  down by footprint volume (radius²·height). */
export const STRUCTURE_MAX_HP = 500;
/** Reference volume (the trailer) that maps to {@link STRUCTURE_MAX_HP}. */
const STRUCTURE_REF_VOLUME = 2 * 2 * 2.8;

/** HP for a cover structure, scaled by its size (volume) and capped at the max. */
export function structureHp(radius: number, height: number): number {
  const vol = radius * radius * height;
  return Math.max(20, Math.round(Math.min(STRUCTURE_MAX_HP, (STRUCTURE_MAX_HP * vol) / STRUCTURE_REF_VOLUME)));
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
  /** HP-bearing: becomes a destructible `CoverStructure` (crumbles when killed)
   *  instead of a static obstacle+prop. HP is scaled from radius/height. */
  destructible?: boolean;
}

/** A decorative kind: placed for flavor, no collision (footprint is spacing only). */
interface DecorKind {
  assetId: PropAssetId;
  foot: number;
  count: number;
}

const COVER: CoverKind[] = [
  // Destructible HP structures: trailers are the "houses" (largest → 500 HP);
  // cars and dumpsters scale down by size. These crumble when their HP is gone.
  { assetId: 'prop.arena.trailer', radius: 2, height: 2.8, count: 2, destructible: true },
  { assetId: 'prop.arena.trailer.teal', radius: 2, height: 2.8, count: 1, destructible: true },
  { assetId: 'prop.arena.car.burned', radius: 1.6, height: 1.7, count: 1, destructible: true },
  { assetId: 'prop.arena.dumpster', radius: 1.3, height: 1.5, count: 1, destructible: true },
  // Static cover (no HP — never destructible).
  { assetId: 'prop.arena.scrap', radius: 1.2, height: 1.4, count: 1 },
];

/** Burning barrels per side (mirrored) — interactive, destructible entities. */
const BARREL_COUNT = 2;
/** Footprint used only for placement spacing (barrels don't block movement). */
const BARREL_FOOT = 0.6;

/** Oil-drum piles per side (mirrored) — a huddle of 3 destructible drums each. */
const DRUM_PILE_COUNT = 1;
/** Loose single oil drums per side (mirrored). */
const DRUM_LOOSE_COUNT = 2;
/** Placement footprints for a drum pile vs a loose drum. */
const DRUM_PILE_FOOT = 1.1;
const DRUM_LOOSE_FOOT = 0.6;
/** Drums in a standard pile, and how tightly they huddle. */
const DRUM_PILE_SIZE = 3;
const DRUM_PILE_HUDDLE = 0.5;

/** Tire stacks per side (mirrored) — the server spawns a 3-tire destructible
 *  pile at each (the old static tire-pile decor is now fully destructible). */
const TIRE_STACK_COUNT = 2;
/** Footprint used only for placement spacing. */
const TIRE_STACK_FOOT = 1.2;

const DECOR: DecorKind[] = [
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
  const barrels: { x: number; z: number }[] = [];
  const drums: { x: number; z: number }[] = [];
  const tireStacks: { x: number; z: number }[] = [];
  const structures: CoverStructureSpec[] = [];
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

  // Cover: collidable props, mirrored for fairness. Destructible kinds become
  // HP-bearing structure specs (the server replicates them); static kinds become
  // plain obstacle+prop pairs.
  for (const kind of COVER) {
    for (let n = 0; n < kind.count; n++) {
      const spot = findSpot(kind.radius);
      if (!spot) continue;
      const rot = rng() * Math.PI * 2;
      if (kind.destructible) {
        const maxHp = structureHp(kind.radius, kind.height);
        structures.push(
          { assetId: kind.assetId, x: spot.x, z: spot.z, rotation: rot, radius: kind.radius, height: kind.height, maxHp },
          { assetId: kind.assetId, x: -spot.x, z: -spot.z, rotation: rot + Math.PI, radius: kind.radius, height: kind.height, maxHp },
        );
      } else {
        placeCover(props, obstacles, kind, spot.x, spot.z, rot, rng);
        placeCover(props, obstacles, kind, -spot.x, -spot.z, rot + Math.PI, rng);
      }
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

  // Burning barrels: interactive entities (no collision/props), mirrored.
  for (let n = 0; n < BARREL_COUNT; n++) {
    const spot = findSpot(BARREL_FOOT);
    if (!spot) continue;
    barrels.push({ x: spot.x, z: spot.z }, { x: -spot.x, z: -spot.z });
  }

  // Oil-drum piles (3 huddled) + loose drums: destructible entities (no static
  // collision/props — the server spawns and replicates them), mirrored.
  const pushPile = (cx: number, cz: number) => {
    for (let i = 0; i < DRUM_PILE_SIZE; i++) {
      const a = (i / DRUM_PILE_SIZE) * Math.PI * 2 + rng() * 0.6;
      drums.push({ x: cx + Math.cos(a) * DRUM_PILE_HUDDLE, z: cz + Math.sin(a) * DRUM_PILE_HUDDLE });
    }
  };
  for (let n = 0; n < DRUM_PILE_COUNT; n++) {
    const spot = findSpot(DRUM_PILE_FOOT);
    if (!spot) continue;
    pushPile(spot.x, spot.z);
    pushPile(-spot.x, -spot.z);
  }
  for (let n = 0; n < DRUM_LOOSE_COUNT; n++) {
    const spot = findSpot(DRUM_LOOSE_FOOT);
    if (!spot) continue;
    drums.push({ x: spot.x, z: spot.z }, { x: -spot.x, z: -spot.z });
  }

  // Tire stacks: destructible 3-tire piles (no static collision/props), mirrored.
  for (let n = 0; n < TIRE_STACK_COUNT; n++) {
    const spot = findSpot(TIRE_STACK_FOOT);
    if (!spot) continue;
    tireStacks.push({ x: spot.x, z: spot.z }, { x: -spot.x, z: -spot.z });
  }

  const layout: GeneratedArenaLayout = { obstacles, props, barrels, drums, tireStacks, structures };
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
