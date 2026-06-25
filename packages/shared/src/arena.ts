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

import {
  ARENA_HALF_SIZE,
  ARENA_HALF_Z,
  ARENA_POND,
  ARENA_SPAWN_POINTS,
  ZOMBIE_FLANK_PORTALS,
  type ArenaObstacle,
} from './constants.js';
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
  drums: { x: number; y?: number; z: number }[];
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
  /** Zombie mode: this structure can't be damaged or destroyed (indestructible
   *  trailer cover). It still blocks movement + projectiles but never crumbles. */
  indestructible?: boolean;
  /** Visual stretch along the prop's local length (X) axis (1 = base model).
   *  Trailers get a randomized value so they vary in length, never in width. */
  lengthScale?: number;
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

/** A trailer's base collision half-extents (local space, before `lengthScale`):
 *  half its body LENGTH (local X) and half its WIDTH (local Z). The collider is
 *  built to these so it hugs the rectangle — never wider than the body. */
export const TRAILER_HALF_LENGTH = 2.4;
export const TRAILER_HALF_WIDTH = 1.2;

/** Footprint half-extents for the log cabins: `hw` = half LENGTH (local X, before
 *  lengthScale), `hd` = half WIDTH (local Z). Long + rectangular like the old
 *  trailers; the collider tiles width-circles down the length. */
const BUILDING_FOOTPRINTS: Record<string, { hw: number; hd: number }> = {
  'prop.building.shack': { hw: 2.4, hd: 1.25 },
  'prop.building.shack.small': { hw: 2.0, hd: 1.2 },
};

/** True for trailer cover — the elongated, length-varied structures whose collider
 *  is a length-fitted capsule rather than a single circle. */
export function isTrailerAsset(assetId: string): boolean {
  return assetId.startsWith('prop.arena.trailer');
}

/**
 * Collision circles approximating a cover structure's footprint — shared by the
 * server's authoritative collider and the client's predictor so both resolve
 * against the IDENTICAL shape. A trailer becomes a capsule: a row of width-radius
 * circles tiled down its (scaled) length, oriented by its yaw, so the collider
 * fits the long rectangle and never exceeds its width. Every other structure
 * stays a single circle of `radius` (its existing footprint).
 */
export function structureFootprint(
  assetId: string,
  x: number,
  z: number,
  rotation: number,
  radius: number,
  height: number,
  lengthScale = 1,
): ArenaObstacle[] {
  if (assetId === 'prop.arena.chest') {
    const halfWidth = 0.5;
    const halfLength = 1.0;
    const dirX = Math.cos(rotation);
    const dirZ = -Math.sin(rotation);
    const reach = halfLength - halfWidth;
    if (reach < 1e-3) return [{ x, z, radius: halfWidth, height }];
    const segments = Math.max(1, Math.ceil((reach * 2) / halfWidth));
    const circles: ArenaObstacle[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = -reach + (reach * 2 * i) / segments;
      circles.push({ x: x + dirX * t, z: z + dirZ * t, radius: halfWidth, height });
    }
    return circles;
  }

  if (assetId === 'prop.arena.palisade') {
    // A thin, long wall: tile small circles along its length so players take cover
    // behind it and slip around the ends (radius = the wall's half-length).
    const halfWidth = 0.45;
    const halfLength = radius;
    const dirX = Math.cos(rotation);
    const dirZ = -Math.sin(rotation);
    const reach = halfLength - halfWidth;
    if (reach < 1e-3) return [{ x, z, radius: halfWidth, height }];
    const segments = Math.max(1, Math.ceil((reach * 2) / halfWidth));
    const circles: ArenaObstacle[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = -reach + (reach * 2 * i) / segments;
      circles.push({ x: x + dirX * t, z: z + dirZ * t, radius: halfWidth, height });
    }
    return circles;
  }

  if (assetId === 'prop.arena.fence.rust') {
    const halfWidth = 0.8;
    const halfLength = radius; // door.width / 2
    const dirX = Math.cos(rotation);
    const dirZ = -Math.sin(rotation);
    const reach = halfLength - halfWidth;
    if (reach < 1e-3) return [{ x, z, radius: halfWidth, height }];
    const segments = Math.max(1, Math.ceil((reach * 2) / halfWidth));
    const circles: ArenaObstacle[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = -reach + (reach * 2 * i) / segments;
      circles.push({ x: x + dirX * t, z: z + dirZ * t, radius: halfWidth, height });
    }
    return circles;
  }

  const bf = BUILDING_FOOTPRINTS[assetId];
  if (bf) {
    // A long rectangular cabin (like the old trailers): tile width-radius circles
    // down its (length-scaled) length so the collider hugs the rectangle and is
    // never wider than the body.
    const halfWidth = bf.hd;
    const halfLength = bf.hw * lengthScale;
    const dirX = Math.cos(rotation);
    const dirZ = -Math.sin(rotation);
    const reach = halfLength - halfWidth;
    if (reach < 1e-3) return [{ x, z, radius: halfWidth, height }];
    const segments = Math.max(1, Math.ceil((reach * 2) / halfWidth));
    const circles: ArenaObstacle[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = -reach + (reach * 2 * i) / segments;
      circles.push({ x: x + dirX * t, z: z + dirZ * t, radius: halfWidth, height });
    }
    return circles;
  }

  if (!isTrailerAsset(assetId)) return [{ x, z, radius, height }];
  const halfWidth = TRAILER_HALF_WIDTH;
  const halfLength = TRAILER_HALF_LENGTH * lengthScale;
  // World direction of the trailer's local length (X) axis from its yaw — the same
  // convention the renderer and the car-forward axis use.
  const dirX = Math.cos(rotation);
  const dirZ = -Math.sin(rotation);
  // Tile circles (radius = half-width) along the inner length; the radius rounds
  // the ends out to the true body length. Spacing ≈ one radius so the sides stay
  // close to straight (overlapping circles, no scalloped gaps).
  const reach = halfLength - halfWidth;
  if (reach < 1e-3) return [{ x, z, radius: halfWidth, height }];
  const segments = Math.max(1, Math.ceil((reach * 2) / halfWidth));
  const circles: ArenaObstacle[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = -reach + (reach * 2 * i) / segments;
    circles.push({ x: x + dirX * t, z: z + dirZ * t, radius: halfWidth, height });
  }
  return circles;
}

// --- Placement constraints (world units) ---
const MARGIN = 3; // keep objects this far inside the walls
const MAX_R = ARENA_HALF_SIZE - MARGIN; // outer bound for object centers (X)
const MAX_R_Z_FFA = ARENA_HALF_Z - MARGIN; // outer bound along Z in the (longer) FFA arena
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
  /** Override the size-scaled HP with a fixed value (destructible kinds only). */
  maxHp?: number;
}

/** A decorative kind: placed for flavor, no collision (footprint is spacing only). */
interface DecorKind {
  assetId: PropAssetId;
  foot: number;
  count: number;
}

const COVER: CoverKind[] = [
  // Timber village houses — the medieval "buildings" (largest HP, as big as the
  // old trailers). Destructible: they crumble to rubble when their HP runs out,
  // and their windows glow warmly at dusk. Indestructible in zombie mode (loop).
  { assetId: 'prop.building.shack', radius: 2.0, height: 2.8, count: 2, destructible: true },
  { assetId: 'prop.building.shack.small', radius: 1.7, height: 2.6, count: 1, destructible: true },
  // Battlefield barricades — wooden palisade walls (a tiled thin footprint, so
  // you take cover behind them and flank around the ends).
  { assetId: 'prop.arena.palisade', radius: 1.5, height: 1.9, count: 2, destructible: true },
  // The wrecked wagon (the old burned-car silhouette, reskinned) — it rolls and
  // smoulders when shot, since its id still contains 'car' (see CoverStructureEntity).
  { assetId: 'prop.arena.car.burned', radius: 1.6, height: 1.7, count: 1, destructible: true },
  // Trees + boulder (static nature). The well is destructible; its `height` is set
  // tall so its integrity bar floats above the well roof instead of inside it.
  { assetId: 'prop.tree', radius: 1.1, height: 2.8, count: 2 },
  { assetId: 'prop.rock', radius: 0.8, height: 0.8, count: 1 },
  { assetId: 'prop.well', radius: 1.0, height: 2.8, count: 1, destructible: true },
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
  { assetId: 'prop.arena.trash', foot: 1.2, count: 3 }, // woodpiles
  { assetId: 'prop.arena.debris', foot: 1.0, count: 3 }, // scattered planks + stone
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

let cache: { seed: number; zombieMode: boolean; layout: GeneratedArenaLayout } | null = null;

/**
 * Build the arena layout for `seed`. Pure and memoized on the last (seed,
 * zombieMode) pair, so the renderer, the predictor, and the server can all call
 * it freely. `zombieMode` packs in extra (indestructible) trailers and more oil
 * drums, and keeps cover clear of the flanking spawn portals — the client must
 * pass the SAME flag as the server so both rebuild the identical layout.
 */
export function generateArenaLayout(seed: number, zombieMode = false): GeneratedArenaLayout {
  const s = seed >>> 0 || DEFAULT_ARENA_SEED;
  if (cache && cache.seed === s && cache.zombieMode === zombieMode) return cache.layout;

  const rng = mulberry32(s);
  const obstacles: ArenaObstacle[] = [];
  const props: MapProp[] = [];
  const barrels: { x: number; z: number }[] = [];
  const drums: { x: number; y?: number; z: number }[] = [];
  const tireStacks: { x: number; z: number }[] = [];
  const structures: CoverStructureSpec[] = [];
  /** Footprints already taken (includes mirrors) for separation checks. */
  const taken: { x: number; z: number; r: number }[] = [];

  // FFA scales spawn Z out to the ends of the longer arena (matches the server's
  // resetPlayer); zombie keeps the authored square positions.
  const spawnZScale = zombieMode ? 1 : ARENA_HALF_Z / ARENA_HALF_SIZE;
  const farFromSpawns = (x: number, z: number, fr: number) =>
    ARENA_SPAWN_POINTS.every((sp) => Math.hypot(x - sp.x, z - sp.z * spawnZScale) >= SPAWN_CLEAR + fr);
  const farFromPortal = (x: number, z: number, fr: number) =>
    Math.hypot(x - PORTAL.x, z - PORTAL.z) >= PORTAL_CLEAR + fr &&
    Math.hypot(x + PORTAL.x, z + PORTAL.z) >= PORTAL_CLEAR + fr &&
    // Zombie mode: also keep cover off the flanking side portals so the gateways
    // (and the hordes pouring out of them) stay unobstructed.
    (!zombieMode ||
      ZOMBIE_FLANK_PORTALS.every((p) => Math.hypot(x - p.x, z - p.z) >= PORTAL_CLEAR + fr));
  const farFromTaken = (x: number, z: number, fr: number) =>
    taken.every((t) => Math.hypot(x - t.x, z - t.z) >= t.r + fr + GAP);

  /** Find a symmetric-safe spot for footprint `fr`, or null after N tries. */
  const maxRZ = zombieMode ? MAX_R : MAX_R_Z_FFA; // FFA arena is longer N/S
  function findSpot(fr: number): { x: number; z: number } | null {
    for (let i = 0; i < 40; i++) {
      const x = (rng() * 2 - 1) * MAX_R;
      const z = (rng() * 2 - 1) * maxRZ;
      // Keep clear of the center so a piece can't overlap its own mirror.
      if (Math.hypot(x, z) < fr + GAP) continue;
      // FFA: keep everything out of the central pond/island — only the chest lives there.
      if (!zombieMode && Math.hypot(x - ARENA_POND.x, z - ARENA_POND.z) < ARENA_POND.pondR + GAP + fr)
        continue;
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
    const isBuilding = kind.assetId.startsWith('prop.building');
    // Zombie mode: buildings are indestructible hard cover, and cottages spawn two
    // extra per side (+4 across the mirror) for more cover against the horde.
    const indestructible = zombieMode && isBuilding;
    const count =
      zombieMode && kind.assetId === 'prop.building.shack' ? kind.count + 2 : kind.count;
    for (let n = 0; n < count; n++) {
      const spot = findSpot(kind.radius);
      if (!spot) continue;
      const rot = rng() * Math.PI * 2;
      // Cabins vary in length (like the old trailers) so they don't look stamped:
      // a random 1.0–1.5× stretch along the prop's long (X) axis. Props stay 1×.
      const lengthScale = isBuilding ? 1 + rng() * 0.5 : 1;
      if (kind.destructible) {
        const maxHp = kind.maxHp ?? structureHp(kind.radius, kind.height);
        structures.push(
          { assetId: kind.assetId, x: spot.x, z: spot.z, rotation: rot, radius: kind.radius, height: kind.height, maxHp, indestructible, lengthScale },
          { assetId: kind.assetId, x: -spot.x, z: -spot.z, rotation: rot + Math.PI, radius: kind.radius, height: kind.height, maxHp, indestructible, lengthScale },
        );
      } else {
        placeCover(props, obstacles, kind, spot.x, spot.z, rot, rng);
        placeCover(props, obstacles, kind, -spot.x, -spot.z, rot + Math.PI, rng);
      }
    }
  }

  // 12-drum pyramid (only in normal Arena mode)
  if (!zombieMode) {
    const r = 0.45;
    const baseDrums = [
      { dx: 0, dz: -2 * r },
      { dx: 2 * r, dz: -2 * r },
      { dx: -2 * r, dz: 0 },
      { dx: 0, dz: 0 },
      { dx: 2 * r, dz: 0 },
      { dx: -2 * r, dz: 2 * r },
      { dx: 0, dz: 2 * r },
    ];
    const midDrums = [
      { dx: -r, dz: -r },
      { dx: r, dz: -r },
      { dx: -r, dz: r },
      { dx: r, dz: r },
    ];
    const topDrums = [
      { dx: 0, dz: 0 },
    ];

    // Find a spot close to (0, 0) that does not overlap with trailers or cover structures.
    let pyramidSpot = { x: 0, z: 0 };
    let found = false;
    const pyramidRadius = 3 * r; // 1.35
    for (let radius = 0; radius < 15 && !found; radius += 0.5) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Check if this spot is clear of all structures
        let clear = true;
        for (const s of structures) {
          const footprints = structureFootprint(s.assetId, s.x, s.z, s.rotation, s.radius, s.height, s.lengthScale);
          for (const f of footprints) {
            const dx = x - f.x;
            const dz = z - f.z;
            const minDist = f.radius + pyramidRadius + GAP;
            if (dx * dx + dz * dz < minDist * minDist) {
              clear = false;
              break;
            }
          }
          if (!clear) break;
        }

        // Also check spawn points clear
        if (clear) {
          if (!farFromSpawns(x, z, pyramidRadius) || !farFromPortal(x, z, pyramidRadius)) {
            clear = false;
          }
        }

        // Keep the drum pyramid out of the central pond/island.
        if (clear && Math.hypot(x, z) < ARENA_POND.pondR + pyramidRadius + GAP) {
          clear = false;
        }

        if (clear) {
          pyramidSpot = { x, z };
          found = true;
          break;
        }
      }
    }

    const px = pyramidSpot.x;
    const pz = pyramidSpot.z;

    // Add base drums (y = 0.5)
    for (const b of baseDrums) {
      drums.push({ x: px + b.dx, y: 0.5, z: pz + b.dz });
    }
    // Add mid drums (y = 1.5)
    for (const m of midDrums) {
      drums.push({ x: px + m.dx, y: 1.5, z: pz + m.dz });
    }
    // Add top drum (y = 2.5)
    for (const t of topDrums) {
      drums.push({ x: px + t.dx, y: 2.5, z: pz + t.dz });
    }

    // Add the base drums and their mirrors to taken so other dynamic props don't clip them
    for (const b of baseDrums) {
      const drumX = px + b.dx;
      const drumZ = pz + b.dz;
      taken.push({ x: drumX, z: drumZ, r: r });
      taken.push({ x: -drumX, z: -drumZ, r: r });
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
  // Zombie mode: ~30% more oil drums (more molotov fuel for the hordes). Scattered
  // as loose singles on top of the base population above.
  if (zombieMode) {
    const baseDrums = (DRUM_PILE_COUNT * DRUM_PILE_SIZE + DRUM_LOOSE_COUNT) * 2;
    const extraDrums = Math.round(baseDrums * 0.3);
    for (let n = 0; n < extraDrums; n++) {
      const spot = findSpot(DRUM_LOOSE_FOOT);
      if (!spot) continue;
      drums.push({ x: spot.x, z: spot.z });
    }
  }

  // Tire stacks: destructible 3-tire piles (no static collision/props), mirrored.
  for (let n = 0; n < TIRE_STACK_COUNT; n++) {
    const spot = findSpot(TIRE_STACK_FOOT);
    if (!spot) continue;
    tireStacks.push({ x: spot.x, z: spot.z }, { x: -spot.x, z: -spot.z });
  }

  // Central pond (FFA only): make the water moat impassable with a grid of
  // overlapping collision circles, leaving the island (centre) and the N/S bridge
  // lane (|x| < bridgeHalfW) clear. Players can only reach the island — and the
  // chest on it — by crossing a bridge.
  if (!zombieMode) {
    obstacles.push(...pondObstacles());
  }

  const layout: GeneratedArenaLayout = { obstacles, props, barrels, drums, tireStacks, structures };
  cache = { seed: s, zombieMode, layout };
  return layout;
}

/** Collision circles that fill the pond's water ring (everything except the
 *  island and the N/S bridge lane), so the moat blocks movement. */
function pondObstacles(): ArenaObstacle[] {
  const P = ARENA_POND;
  const cr = 1.2; // circle radius
  const step = 1.5;
  const out: ArenaObstacle[] = [];
  const n = Math.ceil(P.pondR / step);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = P.x + i * step;
      const z = P.z + j * step;
      const d = Math.hypot(x - P.x, z - P.z);
      if (d < P.islandR + 0.3) continue; // keep the island walkable
      if (d > P.pondR) continue; // only within the moat
      if (Math.abs(x - P.x) < P.bridgeHalfW + cr) continue; // keep the N/S lane open
      // Moat blocks players (walk around) but NOT projectiles (shots fly over it).
      out.push({ x, z, radius: cr, height: 1, blockProjectiles: false });
    }
  }
  return out;
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
