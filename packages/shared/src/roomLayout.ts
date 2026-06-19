/**
 * Procedural Room System — zombie mode map expansion.
 *
 * The original trailer-park arena (50×50, x/z ∈ [-25, 25]) is the "Main Room."
 * Three additional sections attach around it in a U-loop, each gated by a
 * corrugated-metal door that opens when a specific wave is cleared. The loop
 * direction is:
 *
 *   Main Room → Section 1 (left) → Section 2 (top) → Section 3 (right) → Main Room
 *
 * Each section slot has 3–4 shape templates selected per-match by the seed, so
 * every run feels different while the connection topology stays fixed. Cover
 * (trailers, drums, barrels, etc.) is scattered inside each section's bounds
 * using the same procedural logic as the main room.
 *
 * Everything is deterministic from the match seed so server and client build the
 * identical layout without any replication beyond the seed itself.
 */

import {
  ARENA_HALF_SIZE,
  DOOR_UNLOCK_WAVES,
  type SpawnPoint,
} from './constants.js';
import type { PropAssetId, MapProp } from './assets.js';
import {
  type CoverStructureSpec,
  structureHp,
  isTrailerAsset,
} from './arena.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A generated section's world-space bounds (axis-aligned rectangle). */
export interface SectionBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A section's full definition (bounds + meta produced by the generator). */
export interface SectionDef {
  /** 0-based index (0 = Section 1 / left, 1 = Section 2 / top, 2 = Section 3 / right). */
  index: number;
  /** Human-readable tag. */
  name: string;
  bounds: SectionBounds;
  /** Zombie spawn portals inside this section (4 per section). */
  portalPoints: SpawnPoint[];
  /** Which template was picked for this slot. */
  templateId: string;
}

/** A door between two sections (or between a section and the main room). */
export interface DoorDef {
  /** 0-based index (matches DOOR_UNLOCK_WAVES index). */
  index: number;
  /** World-space centre of the gap. */
  x: number;
  z: number;
  /** Width of the passable gap (world units). */
  width: number;
  /** If true the door runs along the Z axis (a gap in a wall that runs along X);
   *  otherwise it runs along the X axis (a gap in a wall that runs along Z). */
  isVertical: boolean;
  /** The wave that opens this door. */
  unlockWave: number;
}

/** The full generated room layout for a zombie match. */
export interface RoomLayout {
  sections: SectionDef[];
  doors: DoorDef[];
}

// ---------------------------------------------------------------------------
// Section templates
// ---------------------------------------------------------------------------

/** A shape template for a section slot. Bounds are relative to the slot's anchor
 *  (the generator maps them to world space). `coverDensity` controls how many
 *  structures/barrels the scatter plants. */
interface SectionTemplate {
  id: string;
  /** Bounds relative to the slot anchor. The generator offsets these into world
   *  space depending on which slot (left/top/right) the template fills. */
  relBounds: SectionBounds;
  /** Multiplier on the base cover count (1 = normal, 0.6 = sparse, 1.4 = dense). */
  coverDensity: number;
}

// -- Section 1 (left wing) templates --
// Slot anchor: the left edge of the main room (x = -25).
// Templates extend leftward (negative X) and span some Z range.
const LEFT_TEMPLATES: SectionTemplate[] = [
  {
    id: 'left.wide_yard',
    relBounds: { minX: -25, maxX: 0, minZ: -15, maxZ: 25 },
    coverDensity: 1,
  },
  {
    id: 'left.narrow_alley',
    relBounds: { minX: -18, maxX: 0, minZ: -15, maxZ: 25 },
    coverDensity: 0.7,
  },
  {
    id: 'left.l_bend',
    relBounds: { minX: -25, maxX: 0, minZ: -5, maxZ: 25 },
    coverDensity: 0.9,
  },
];

// -- Section 2 (top corridor) templates --
// Slot anchor: the top edge of the main room (z = 25).
// Templates extend upward (positive Z) spanning from left-section's left edge
// to right-section's right edge.
const TOP_TEMPLATES: SectionTemplate[] = [
  {
    id: 'top.long_hall',
    relBounds: { minX: -50, maxX: 25, minZ: 0, maxZ: 25 },
    coverDensity: 1,
  },
  {
    id: 'top.divided_hall',
    relBounds: { minX: -50, maxX: 25, minZ: 0, maxZ: 25 },
    coverDensity: 1.3,
  },
  {
    id: 'top.wide_plaza',
    relBounds: { minX: -50, maxX: 25, minZ: 0, maxZ: 18 },
    coverDensity: 0.7,
  },
];

// -- Section 3 (right wing) templates --
// Slot anchor: the right edge of the main room (x = 25).
// Templates extend rightward (positive X).
const RIGHT_TEMPLATES: SectionTemplate[] = [
  {
    id: 'right.wide_yard',
    relBounds: { minX: 0, maxX: 25, minZ: -15, maxZ: 25 },
    coverDensity: 1,
  },
  {
    id: 'right.split_rooms',
    relBounds: { minX: 0, maxX: 25, minZ: -15, maxZ: 25 },
    coverDensity: 1.3,
  },
  {
    id: 'right.narrow_alley',
    relBounds: { minX: 0, maxX: 18, minZ: -15, maxZ: 25 },
    coverDensity: 0.7,
  },
  {
    id: 'right.t_junction',
    relBounds: { minX: 0, maxX: 25, minZ: -5, maxZ: 25 },
    coverDensity: 0.9,
  },
];

const SLOT_TEMPLATES: SectionTemplate[][] = [LEFT_TEMPLATES, TOP_TEMPLATES, RIGHT_TEMPLATES];

const SLOT_NAMES = ['Left Wing', 'Top Corridor', 'Right Wing'];

// ---------------------------------------------------------------------------
// Deterministic PRNG (same mulberry32 used by the arena layout generator)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Layout generator
// ---------------------------------------------------------------------------

/** Offset a template's relative bounds into world space for the given slot. */
function worldBounds(slot: number, tmpl: SectionTemplate): SectionBounds {
  switch (slot) {
    case 0: // left wing: anchor at x = -ARENA_HALF_SIZE
      return {
        minX: -ARENA_HALF_SIZE + tmpl.relBounds.minX,
        maxX: -ARENA_HALF_SIZE + tmpl.relBounds.maxX,
        minZ: tmpl.relBounds.minZ,
        maxZ: tmpl.relBounds.maxZ,
      };
    case 1: // top corridor: anchor at z = +ARENA_HALF_SIZE
      return {
        minX: tmpl.relBounds.minX,
        maxX: tmpl.relBounds.maxX,
        minZ: ARENA_HALF_SIZE + tmpl.relBounds.minZ,
        maxZ: ARENA_HALF_SIZE + tmpl.relBounds.maxZ,
      };
    case 2: // right wing: anchor at x = +ARENA_HALF_SIZE
      return {
        minX: ARENA_HALF_SIZE + tmpl.relBounds.minX,
        maxX: ARENA_HALF_SIZE + tmpl.relBounds.maxX,
        minZ: tmpl.relBounds.minZ,
        maxZ: tmpl.relBounds.maxZ,
      };
    default:
      throw new Error(`Invalid slot ${slot}`);
  }
}

/** Place 4 portal points inside a section's bounds (inset from edges). */
function sectionPortals(b: SectionBounds): SpawnPoint[] {
  const inset = 3;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const ix = Math.min(inset, (b.maxX - b.minX) / 2 - 1);
  const iz = Math.min(inset, (b.maxZ - b.minZ) / 2 - 1);
  return [
    { x: b.minX + ix, z: cz },       // left/west edge
    { x: b.maxX - ix, z: cz },       // right/east edge
    { x: cx, z: b.minZ + iz },       // bottom/south edge
    { x: cx, z: b.maxZ - iz },       // top/north edge
  ];
}

/** Door gap width. */
const DOOR_WIDTH = 6;

/**
 * Generate the room layout for a zombie match from the match seed. Deterministic:
 * the same seed always produces the same sections, doors, and portals so server
 * and client can independently rebuild the identical layout.
 */
export function generateRoomLayout(seed: number): RoomLayout {
  const rng = mulberry32((seed >>> 0) + 0xbeef); // offset so the room RNG
  // stream doesn't overlap the arena-layout RNG stream (both start from `seed`).

  const sections: SectionDef[] = [];
  const doors: DoorDef[] = [];

  for (let slot = 0; slot < 3; slot++) {
    const pool = SLOT_TEMPLATES[slot]!;
    const tmpl = pool[Math.floor(rng() * pool.length)]!;
    const bounds = worldBounds(slot, tmpl);
    sections.push({
      index: slot,
      name: SLOT_NAMES[slot]!,
      bounds,
      portalPoints: sectionPortals(bounds),
      templateId: tmpl.id,
    });
  }

  // Door 1: left wall of main room → Section 1
  doors.push({
    index: 0,
    x: -ARENA_HALF_SIZE,
    z: 5,
    width: DOOR_WIDTH,
    isVertical: true,
    unlockWave: DOOR_UNLOCK_WAVES[0]!,
  });
  // Door 2: top wall of Section 1 → Section 2
  doors.push({
    index: 1,
    x: -ARENA_HALF_SIZE - 12,
    z: ARENA_HALF_SIZE,
    width: DOOR_WIDTH,
    isVertical: false,
    unlockWave: DOOR_UNLOCK_WAVES[1]!,
  });
  // Door 3: top wall of main room → Section 2 (right portion)
  doors.push({
    index: 2,
    x: 12,
    z: ARENA_HALF_SIZE,
    width: DOOR_WIDTH,
    isVertical: false,
    unlockWave: DOOR_UNLOCK_WAVES[2]!,
  });
  // Door 4: right wall of main room → Section 3 (loop close)
  doors.push({
    index: 3,
    x: ARENA_HALF_SIZE,
    z: 5,
    width: DOOR_WIDTH,
    isVertical: true,
    unlockWave: DOOR_UNLOCK_WAVES[3]!,
  });

  return { sections, doors };
}

// ---------------------------------------------------------------------------
// Section cover generation
// ---------------------------------------------------------------------------

/** Cover spec for a section — same types as the main arena. Counts are scaled by
 *  the section's area relative to the main room (50×50 = 2500) and the template's
 *  density multiplier. */
interface SectionCoverKind {
  assetId: PropAssetId;
  radius: number;
  height: number;
  baseCount: number;
  maxHp?: number;
}

const SECTION_COVER: SectionCoverKind[] = [
  { assetId: 'prop.arena.trailer', radius: 2, height: 2.8, baseCount: 3 },
  { assetId: 'prop.arena.trailer.teal', radius: 2, height: 2.8, baseCount: 1 },
  { assetId: 'prop.arena.car.burned', radius: 1.6, height: 1.7, baseCount: 2 },
  { assetId: 'prop.arena.dumpster', radius: 1.3, height: 1.5, baseCount: 1 },
  { assetId: 'prop.arena.scrap', radius: 1.2, height: 1.4, baseCount: 1, maxHp: 125 },
];

const SECTION_DECOR: { assetId: PropAssetId; foot: number; baseCount: number }[] = [
  { assetId: 'prop.arena.trash', foot: 1.2, baseCount: 2 },
  { assetId: 'prop.arena.crate.broken', foot: 1.2, baseCount: 2 },
  { assetId: 'prop.arena.debris', foot: 1.0, baseCount: 2 },
];

/** Minimum breathing room between footprints (same as main arena). */
const GAP = 2;

/** Generated cover for a single section (to be added lazily when the door opens). */
export interface SectionCoverResult {
  structures: CoverStructureSpec[];
  barrels: { x: number; z: number }[];
  drums: { x: number; z: number }[];
  tireStacks: { x: number; z: number }[];
  props: MapProp[];
}

/**
 * Scatter cover inside one section. Uses the same object types as the main arena
 * but placed within the section's bounds. Everything is indestructible in zombie
 * mode (trailers). Deterministic from `seed + section.index`.
 */
export function generateSectionCover(
  seed: number,
  section: SectionDef,
): SectionCoverResult {
  const rng = mulberry32((seed >>> 0) + 0xcafe + section.index * 0x1111);
  const b = section.bounds;
  const area = (b.maxX - b.minX) * (b.maxZ - b.minZ);
  const mainArea = ARENA_HALF_SIZE * 2 * ARENA_HALF_SIZE * 2; // 2500
  const areaScale = area / mainArea;

  const structures: CoverStructureSpec[] = [];
  const barrels: { x: number; z: number }[] = [];
  const drums: { x: number; z: number }[] = [];
  const tireStacks: { x: number; z: number }[] = [];
  const props: MapProp[] = [];
  const taken: { x: number; z: number; r: number }[] = [];

  // Portal clearance — keep cover away from spawn portals.
  const portalClear = 4;
  const farFromPortals = (x: number, z: number, fr: number) =>
    section.portalPoints.every(
      (p) => Math.hypot(x - p.x, z - p.z) >= portalClear + fr,
    );
  const farFromTaken = (x: number, z: number, fr: number) =>
    taken.every((t) => Math.hypot(x - t.x, z - t.z) >= t.r + fr + GAP);

  /** Find a random spot inside the section for footprint `fr`. */
  function findSpot(fr: number): { x: number; z: number } | null {
    const margin = 2;
    for (let i = 0; i < 40; i++) {
      const x = b.minX + margin + rng() * (b.maxX - b.minX - 2 * margin);
      const z = b.minZ + margin + rng() * (b.maxZ - b.minZ - 2 * margin);
      if (!farFromPortals(x, z, fr)) continue;
      if (!farFromTaken(x, z, fr)) continue;
      taken.push({ x, z, r: fr });
      return { x, z };
    }
    return null;
  }

  // --- Cover structures (indestructible in zombie mode) ---
  for (const kind of SECTION_COVER) {
    const count = Math.max(1, Math.round(kind.baseCount * areaScale));
    for (let n = 0; n < count; n++) {
      const spot = findSpot(kind.radius);
      if (!spot) continue;
      const rot = rng() * Math.PI * 2;
      const isTrailer = isTrailerAsset(kind.assetId);
      const lengthScale = isTrailer ? 1 + rng() * 0.5 : 1;
      const maxHp = kind.maxHp ?? structureHp(kind.radius, kind.height);
      structures.push({
        assetId: kind.assetId,
        x: spot.x,
        z: spot.z,
        rotation: rot,
        radius: kind.radius,
        height: kind.height,
        maxHp,
        indestructible: isTrailer, // trailers are indestructible in zombie mode
        lengthScale,
      });
    }
  }

  // --- Burning barrels ---
  const barrelCount = Math.max(1, Math.round(2 * areaScale));
  for (let n = 0; n < barrelCount; n++) {
    const spot = findSpot(0.6);
    if (!spot) continue;
    barrels.push({ x: spot.x, z: spot.z });
  }

  // --- Oil drums (loose singles) ---
  const drumCount = Math.max(1, Math.round(3 * areaScale));
  for (let n = 0; n < drumCount; n++) {
    const spot = findSpot(0.6);
    if (!spot) continue;
    drums.push({ x: spot.x, z: spot.z });
  }

  // --- Tire stacks ---
  const tireCount = Math.max(1, Math.round(2 * areaScale));
  for (let n = 0; n < tireCount; n++) {
    const spot = findSpot(1.2);
    if (!spot) continue;
    tireStacks.push({ x: spot.x, z: spot.z });
  }

  // --- Decorative scatter (no collision) ---
  for (const kind of SECTION_DECOR) {
    const count = Math.max(1, Math.round(kind.baseCount * areaScale));
    for (let n = 0; n < count; n++) {
      const spot = findSpot(kind.foot);
      if (!spot) continue;
      const rot = rng() * Math.PI * 2;
      props.push({
        assetId: kind.assetId,
        position: [spot.x, 0, spot.z],
        rotation: [0, rot, 0],
      });
    }
  }

  return { structures, barrels, drums, tireStacks, props };
}

// ---------------------------------------------------------------------------
// Distance-weighted portal selection
// ---------------------------------------------------------------------------

/**
 * Select a zombie spawn portal from all unlocked sections + the main room's
 * existing portals. Portals closer to the nearest human player are heavily
 * favoured (~70% weight to the closest third).
 *
 * `mainPortals` is the existing `ZOMBIE_SPAWN_PORTALS` (unchanged).
 * `layout` + `unlockedSections` determine which section portals are available.
 * `players` is an array of { x, z } for every alive human player.
 */
export function pickWeightedPortal(
  mainPortals: readonly SpawnPoint[],
  layout: RoomLayout,
  unlockedSections: number,
  players: readonly { x: number; z: number }[],
): SpawnPoint {
  // Gather all available portals.
  const all: SpawnPoint[] = [...mainPortals];
  for (let i = 0; i < unlockedSections && i < layout.sections.length; i++) {
    all.push(...layout.sections[i]!.portalPoints);
  }
  if (all.length === 0 || players.length === 0) {
    return mainPortals[0] ?? { x: 0, z: -23 };
  }

  // Distance of each portal to the nearest human player.
  const dists = all.map((p) => {
    let best = Infinity;
    for (const pl of players) {
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      if (d < best) best = d;
    }
    return best;
  });

  // Convert distances to weights: closer = higher weight.
  // Use an inverse-square falloff so close portals dominate.
  const maxDist = Math.max(...dists) + 1;
  const weights = dists.map((d) => {
    const norm = 1 - d / maxDist; // 0..1, 1 = closest
    return norm * norm + 0.05; // square + floor so far portals still have a tiny chance
  });

  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < all.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return all[i]!;
  }
  return all[all.length - 1]!;
}

// ---------------------------------------------------------------------------
// Section boundary enforcement
// ---------------------------------------------------------------------------

/**
 * Clamp a world position so it stays within the main room + any unlocked
 * sections. Called after every movement step (server) and prediction step
 * (client) to prevent entities from walking through walls into locked areas.
 *
 * The main room is always accessible: x ∈ [-H, H], z ∈ [-H, H].
 * Each section has its own axis-aligned bounds, accessible only when unlocked.
 * Doors are narrow gaps in the walls between sections; a position is allowed
 * through a wall only if it's within the door's gap.
 */
export function clampToUnlockedArea(
  x: number,
  z: number,
  layout: RoomLayout,
  unlockedSections: number,
  radius: number = 0,
  prevX?: number,
  prevZ?: number,
): { x: number; z: number } {
  const H = ARENA_HALF_SIZE;

  if (prevX !== undefined && prevZ !== undefined) {
    const buf = radius > 0 ? radius : 1e-3;

    // 1. Left Wall of Main Room: x = -25, z ∈ [-25, 25]
    if ((prevX > -H && x < -H) || (prevX < -H && x > -H)) {
      const t = (-H - prevX) / (x - prevX);
      const zCross = prevZ + t * (z - prevZ);
      if (zCross >= -H && zCross <= H) {
        // Door 1 is at z = 5. Passable range z ∈ [2, 8] if unlockedSections >= 1
        const passable = unlockedSections >= 1 && zCross >= 2 && zCross <= 8;
        if (!passable) {
          x = prevX > -H ? -H + buf : -H - buf;
        }
      }
    }

    // 2. Right Wall of Main Room: x = 25, z ∈ [-25, 25]
    if ((prevX < H && x > H) || (prevX > H && x < H)) {
      const t = (H - prevX) / (x - prevX);
      const zCross = prevZ + t * (z - prevZ);
      if (zCross >= -H && zCross <= H) {
        // Door 4 is at z = 5. Passable range z ∈ [2, 8] if unlockedSections >= 4
        const passable = unlockedSections >= 4 && zCross >= 2 && zCross <= 8;
        if (!passable) {
          x = prevX < H ? H - buf : H + buf;
        }
      }
    }

    // 3. Left dividing wall (between Section 1 and Section 2): z = 25, x ∈ [-50, -25]
    // 4. Top wall of Main Room (between Main Room and Section 2): z = 25, x ∈ [-25, 25]
    if ((prevZ < H && z > H) || (prevZ > H && z < H)) {
      const t = (H - prevZ) / (z - prevZ);
      const xCross = prevX + t * (x - prevX);
      if (xCross >= -50 && xCross <= H) {
        if (xCross >= -50 && xCross < -H) {
          // Left dividing wall. Door 2 is at x = -37. Passable range x ∈ [-40, -34] if unlockedSections >= 2
          const passable = unlockedSections >= 2 && xCross >= -40 && xCross <= -34;
          if (!passable) {
            z = prevZ < H ? H - buf : H + buf;
          }
        } else if (xCross >= -H && xCross <= H) {
          // Top wall of Main Room. Door 3 is at x = 12. Passable range x ∈ [9, 15] if unlockedSections >= 3
          const passable = unlockedSections >= 3 && xCross >= 9 && xCross <= 15;
          if (!passable) {
            z = prevZ < H ? H - buf : H + buf;
          }
        }
      }
    }
  }

  // Quick out: if nothing is unlocked, clamp to main room.
  if (unlockedSections === 0) {
    return { x: clampVal(x, -H, H), z: clampVal(z, -H, H) };
  }

  // Check if the position is inside the main room (always ok).
  if (x >= -H && x <= H && z >= -H && z <= H) {
    return { x, z };
  }

  // Check each unlocked section — if we're inside one, it's fine.
  for (let i = 0; i < unlockedSections && i < layout.sections.length; i++) {
    const b = layout.sections[i]!.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      return { x, z };
    }
  }

  // Position is outside all accessible areas. Push it back to the nearest
  // accessible region. Try the main room first.
  let bx = clampVal(x, -H, H);
  let bz = clampVal(z, -H, H);
  let bestD2 = (x - bx) * (x - bx) + (z - bz) * (z - bz);

  // Then try each unlocked section.
  for (let i = 0; i < unlockedSections && i < layout.sections.length; i++) {
    const b = layout.sections[i]!.bounds;
    const cx = clampVal(x, b.minX, b.maxX);
    const cz = clampVal(z, b.minZ, b.maxZ);
    const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = cx;
      bz = cz;
    }
  }

  return { x: bx, z: bz };
}

function clampVal(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
