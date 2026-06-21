/**
 * Procedural Room System — zombie mode map expansion.
 *
 * The original trailer-park arena (50×50, x/z ∈ [-25, 25]) is the "Main Room."
 * Three additional sections attach **northward** in a linear chain, each gated
 * by a corrugated-metal door that opens when a specific wave is cleared:
 *
 *   Main Room → Section 1 (z 25–65) → Section 2 (z 65–105) → Section 3 (z 105–145)
 *
 * Each section slot has 4 shape templates selected per-match by the seed, so
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
  TRAP_RADIUS,
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
  /** 0-based index (0 = Section 1, 1 = Section 2, 2 = Section 3). */
  index: number;
  /** Human-readable tag. */
  name: string;
  bounds: SectionBounds; // Union bounding box of all boxes in this section
  boxes: SectionBounds[]; // The individual rectangles forming the room shape
  /** Zombie spawn portals inside this section. */
  portalPoints: SpawnPoint[];
  /** Which template was picked for this slot. */
  templateId: string;
}

/** A door between two sections (or between a section and the main room). */
export interface DoorDef {
  /** 0-based index. */
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
// Section templates — Cardinal Layout
// ---------------------------------------------------------------------------

interface LocalBounds {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

interface LocalPortal {
  u: number;
  v: number;
}

/** A shape template in local (u, v) coordinates relative to the direction anchor.
 *  u is outward distance [0, 50], v is perpendicular distance [-25, 25]. */
interface SectionTemplate {
  id: string;
  relBoxes: LocalBounds[];
  relPortals: LocalPortal[];
  coverDensity: number;
}


const LOCAL_TEMPLATES: SectionTemplate[] = [
  {
    id: 'yard.wide',
    relBoxes: [
      { minU: 0, maxU: 50, minV: -20, maxV: 20 },
    ],
    relPortals: [{ u: 45, v: 0 }],
    coverDensity: 1.0,
  },
  {
    id: 'yard.l_bend_right',
    relBoxes: [
      { minU: 0, maxU: 30, minV: -20, maxV: 15 },
      { minU: 25, maxU: 50, minV: -5, maxV: 25 },
    ],
    relPortals: [{ u: 45, v: 20 }],
    coverDensity: 1.0,
  },
  {
    id: 'yard.l_bend_left',
    relBoxes: [
      { minU: 0, maxU: 30, minV: -15, maxV: 20 },
      { minU: 25, maxU: 50, minV: -25, maxV: 5 },
    ],
    relPortals: [{ u: 45, v: -20 }],
    coverDensity: 1.0,
  },
  {
    id: 'yard.t_junction',
    relBoxes: [
      { minU: 0, maxU: 50, minV: -15, maxV: 15 },
      { minU: 20, maxU: 38, minV: -25, maxV: 25 },
    ],
    relPortals: [
      { u: 29, v: -22 },
      { u: 29, v: 22 },
    ],
    coverDensity: 1.0,
  },
];

const DIRECTIONS: ('N' | 'E' | 'S' | 'W')[] = ['N', 'E', 'S', 'W'];
const SLOT_NAMES = ['North Wing', 'East Wing', 'South Wing', 'West Wing'];

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

function getUnionBounds(boxes: SectionBounds[]): SectionBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minZ < minZ) minZ = b.minZ;
    if (b.maxZ > maxZ) maxZ = b.maxZ;
  }
  return { minX, maxX, minZ, maxZ };
}

function transformBounds(
  dir: 'N' | 'E' | 'S' | 'W',
  b: LocalBounds,
): SectionBounds {
  const H = ARENA_HALF_SIZE;
  switch (dir) {
    case 'N':
      return {
        minX: b.minV,
        maxX: b.maxV,
        minZ: H + b.minU,
        maxZ: H + b.maxU,
      };
    case 'S':
      return {
        minX: b.minV,
        maxX: b.maxV,
        minZ: -H - b.maxU,
        maxZ: -H - b.minU,
      };
    case 'E':
      return {
        minX: H + b.minU,
        maxX: H + b.maxU,
        minZ: b.minV,
        maxZ: b.maxV,
      };
    case 'W':
      return {
        minX: -H - b.maxU,
        maxX: -H - b.minU,
        minZ: b.minV,
        maxZ: b.maxV,
      };
  }
}

function transformPoint(
  dir: 'N' | 'E' | 'S' | 'W',
  p: LocalPortal,
): SpawnPoint {
  const H = ARENA_HALF_SIZE;
  switch (dir) {
    case 'N':
      return { x: p.v, z: H + p.u };
    case 'S':
      return { x: p.v, z: -H - p.u };
    case 'E':
      return { x: H + p.u, z: p.v };
    case 'W':
      return { x: -H - p.u, z: p.v };
  }
}

function getDoorDef(slot: number): { x: number; z: number; isVertical: boolean } {
  const H = ARENA_HALF_SIZE;
  switch (slot) {
    case 0: // North
      return { x: 0, z: H, isVertical: false };
    case 1: // East
      return { x: H, z: 0, isVertical: true };
    case 2: // South
      return { x: 0, z: -H, isVertical: false };
    case 3: // West
      return { x: -H, z: 0, isVertical: true };
    default:
      return { x: 0, z: H, isVertical: false };
  }
}

/** Door gap width. */
const DOOR_WIDTH = 16;

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

  for (let slot = 0; slot < 4; slot++) {
    const dir = DIRECTIONS[slot]!;
    const tmpl = LOCAL_TEMPLATES[Math.floor(rng() * LOCAL_TEMPLATES.length)]!;
    const boxes = tmpl.relBoxes.map(b => transformBounds(dir, b));
    sections.push({
      index: slot,
      name: SLOT_NAMES[slot]!,
      bounds: getUnionBounds(boxes),
      boxes,
      portalPoints: tmpl.relPortals.map(p => transformPoint(dir, p)),
      templateId: `${dir.toLowerCase()}.${tmpl.id}`,
    });

    const doorPos = getDoorDef(slot);
    doors.push({
      index: slot,
      x: doorPos.x,
      z: doorPos.z,
      width: DOOR_WIDTH,
      isVertical: doorPos.isVertical,
      unlockWave: DOOR_UNLOCK_WAVES[slot]!,
    });
  }

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
  trap?: TrapDef | null,
): SectionCoverResult {
  const rng = mulberry32((seed >>> 0) + 0xcafe + section.index * 0x1111);
  const boxes = section.boxes;
  
  // Calculate total area of all boxes in this section
  let area = 0;
  for (const b of boxes) {
    area += (b.maxX - b.minX) * (b.maxZ - b.minZ);
  }
  const mainArea = ARENA_HALF_SIZE * 2 * ARENA_HALF_SIZE * 2; // 2500
  const areaScale = area / mainArea;

  const structures: CoverStructureSpec[] = [];
  const barrels: { x: number; z: number }[] = [];
  const drums: { x: number; z: number }[] = [];
  const tireStacks: { x: number; z: number }[] = [];
  const props: MapProp[] = [];
  const taken: { x: number; z: number; r: number }[] = [];

  // Reserve the trap zone first so nothing — trailers, cars, drums, decor —
  // ever spawns on top of a trap (its area must stay clear to be usable). The
  // full trap radius is blocked; `farFromTaken` keeps a GAP beyond that too.
  if (trap) taken.push({ x: trap.x, z: trap.z, r: trap.radius });

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
    const margin = 2.5;
    const boxAreas = boxes.map(b => (b.maxX - b.minX) * (b.maxZ - b.minZ));
    const totalArea = boxAreas.reduce((s, a) => s + a, 0);

    for (let i = 0; i < 60; i++) {
      let r = rng() * totalArea;
      let boxIndex = 0;
      for (let j = 0; j < boxes.length; j++) {
        r -= boxAreas[j]!;
        if (r <= 0) {
          boxIndex = j;
          break;
        }
      }
      const b = boxes[boxIndex]!;
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
 * Sections extend northward. Each door is a horizontal gap at constant z;
 * passage is allowed only through the door's gap when the section is unlocked.
 *
 * `prevX`/`prevZ` determine which side of a wall the entity was on before
 * this step, so the clamp pushes them back to the correct side (no teleports).
 */
/** Shrink a section box inward by `r`, but only on its *outer* walls — the edge
 *  facing the main room (the door side) is left untouched so objects/entities can
 *  sit flush against the connecting passage. The wall layout is determined by the
 *  section's cardinal direction. */
function shrinkBoxForDir(
  b: SectionBounds,
  dir: 'N' | 'E' | 'S' | 'W',
  r: number,
): SectionBounds {
  let minX = b.minX;
  let maxX = b.maxX;
  let minZ = b.minZ;
  let maxZ = b.maxZ;

  if (dir === 'N') {
    minX += r;
    maxX -= r;
    maxZ -= r;
  } else if (dir === 'S') {
    minX += r;
    maxX -= r;
    minZ += r;
  } else if (dir === 'E') {
    minZ += r;
    maxZ -= r;
    maxX -= r;
  } else if (dir === 'W') {
    minZ += r;
    maxZ -= r;
    minX += r;
  }

  return { minX, maxX, minZ, maxZ };
}

function isInsideBox(
  x: number,
  z: number,
  r: number,
  dir: 'N' | 'E' | 'S' | 'W',
  b: SectionBounds,
): boolean {
  const s = shrinkBoxForDir(b, dir, r);
  return x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
}

function clampToBox(
  x: number,
  z: number,
  r: number,
  dir: 'N' | 'E' | 'S' | 'W',
  b: SectionBounds,
): { x: number; z: number } {
  const s = shrinkBoxForDir(b, dir, r);
  return { x: clampVal(x, s.minX, s.maxX), z: clampVal(z, s.minZ, s.maxZ) };
}

/** Centre of a section, anchored on its *largest* box so L/T shapes land on real
 *  floor (the union-bounds centre can fall in the concave notch). */
function sectionCenter(section: SectionDef): { x: number; z: number } {
  let best = section.boxes[0]!;
  let bestArea = -Infinity;
  for (const b of section.boxes) {
    const a = (b.maxX - b.minX) * (b.maxZ - b.minZ);
    if (a > bestArea) {
      bestArea = a;
      best = b;
    }
  }
  return { x: (best.minX + best.maxX) / 2, z: (best.minZ + best.maxZ) / 2 };
}

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

/** The two trap behaviours (see constants for thresholds/cooldowns). */
export type TrapKind = 'heal' | 'death';

/** A trap to place in a section — its kind and world-space centre. */
export interface TrapDef {
  /** The section this trap belongs to. */
  sectionIndex: number;
  kind: TrapKind;
  /** Trap centre (anchored on the section's largest box). */
  x: number;
  z: number;
  /** Trap area radius (world units). */
  radius: number;
}

/**
 * Decide the trap (if any) for a section. Placement alternates so traps stay a
 * scarce, rhythmic reward: even-indexed sections host a trap, odd ones don't.
 * The type is chosen deterministically from the match seed (so server and any
 * observer agree) unless `forcedKind` overrides it. Returns null for sections
 * that host no trap.
 */
export function trapForSection(
  seed: number,
  section: SectionDef,
  forcedKind?: TrapKind,
): TrapDef | null {
  if (section.index % 2 !== 0) return null;
  const c = sectionCenter(section);
  let kind: TrapKind;
  if (forcedKind) {
    kind = forcedKind;
  } else {
    // Own RNG stream, offset off the section so it doesn't track cover layout.
    const rng = mulberry32((seed >>> 0) + 0x7ace + section.index * 0x9e37);
    kind = rng() < 0.5 ? 'heal' : 'death';
  }
  return { sectionIndex: section.index, kind, x: c.x, z: c.z, radius: TRAP_RADIUS };
}

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
  const r = radius;

  const px = prevX !== undefined ? prevX : x;
  const pz = prevZ !== undefined ? prevZ : z;

  // 1. Keep within the overall maximum play area bounds (ZOMBIE_ROOM_HALF_SIZE = 150)
  // Note: individual section boundaries are strictly enforced in step 3.
  const maxLimit = 150;
  x = clampVal(x, -maxLimit + r, maxLimit - r);
  z = clampVal(z, -maxLimit + r, maxLimit - r);

  // 2. Enforce each inter-section wall.
  //    All doors in the layout are either horizontal (isVertical = false)
  //    or vertical (isVertical = true) at the main room edges. The wall blocks
  //    passage unless the door is unlocked AND the entity is within the door's gap.
  for (let i = 0; i < layout.doors.length; i++) {
    const door = layout.doors[i]!;
    const halfW = door.width / 2;

    const inGap = door.isVertical
      ? (z >= door.z - halfW + r && z <= door.z + halfW - r)
      : (x >= door.x - halfW + r && x <= door.x + halfW - r);
    const passable = unlockedSections > i && inGap;

    if (!passable) {
      if (door.isVertical) {
        if (px <= door.x) x = Math.min(x, door.x - r);
        else x = Math.max(x, door.x + r);
      } else {
        if (pz <= door.z) z = Math.min(z, door.z - r);
        else z = Math.max(z, door.z + r);
      }
    }
  }

  // 3. If the entity is outside the main room, verify it's inside an
  //    unlocked section box. If not, push to the nearest allowed position.
  const outsideMain = x < -H || x > H || z < -H || z > H;
  if (outsideMain) {
    // Check unlocked section boxes.
    for (let i = 0; i < unlockedSections && i < layout.sections.length; i++) {
      const section = layout.sections[i]!;
      const dir = DIRECTIONS[section.index]!;
      for (const b of section.boxes) {
        if (isInsideBox(x, z, r, dir, b)) {
          return { x, z }; // Inside a valid section box
        }
      }
    }

    // Not inside any section box — push to the nearest allowed position.
    let bestX = clampVal(x, -H + r, H - r);
    let bestZ = clampVal(z, -H + r, H - r);
    let bestD2 = (x - bestX) * (x - bestX) + (z - bestZ) * (z - bestZ);

    for (let i = 0; i < unlockedSections && i < layout.sections.length; i++) {
      const section = layout.sections[i]!;
      const dir = DIRECTIONS[section.index]!;
      for (const b of section.boxes) {
        const { x: cx, z: cz } = clampToBox(x, z, r, dir, b);
        const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestX = cx;
          bestZ = cz;
        }
      }
    }

    return { x: bestX, z: bestZ };
  }

  // Inside the main room
  return { x, z };
}

function clampVal(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Pick a random spawn point spread evenly across the whole *unlocked* play area —
 * the main room plus every unlocked section. Each candidate box is shrunk inward
 * by `margin` (outer walls only, via {@link shrinkBoxForDir}), boxes are chosen
 * weighted by their usable area (so density is uniform across the floor, not
 * per-room), and a point is sampled uniformly inside the chosen box.
 *
 * When `centerExclusionRadius > 0`, points within that radius of a section's
 * centre are rejected, reserving the wing centre for a future structure (the
 * main room has no reserved centre).
 *
 * Returns a single candidate — the caller is expected to loop and run its own
 * collision accept-test (cover / players / other objects), exactly as the barrel
 * and destructible respawners do. Returns `null` when no box has usable area, or
 * (with exclusion enabled) when every internal sample landed in a reserved centre.
 *
 * `layout === null` falls back to the main room only, matching non-zombie play.
 */
/** Total floor area (world units²) currently accessible: the main room plus every
 *  unlocked section's boxes. Used to scale object capacity so spawn density stays
 *  roughly constant as the arena grows. Overlapping boxes within a section are
 *  counted as-sampled (matching {@link randomSpawnPoint}'s weighting). */
export function unlockedPlayArea(
  layout: RoomLayout | null,
  unlockedSections: number,
): number {
  const H = ARENA_HALF_SIZE;
  let area = 2 * H * (2 * H); // main room (50×50)
  if (layout) {
    const n = Math.min(unlockedSections, layout.sections.length);
    for (let i = 0; i < n; i++) {
      for (const b of layout.sections[i]!.boxes) {
        area += (b.maxX - b.minX) * (b.maxZ - b.minZ);
      }
    }
  }
  return area;
}

export function randomSpawnPoint(
  layout: RoomLayout | null,
  unlockedSections: number,
  margin: number,
  rng: () => number,
  centerExclusionRadius = 0,
): { x: number; z: number } | null {
  const H = ARENA_HALF_SIZE;

  interface Candidate {
    box: SectionBounds;
    area: number;
    center: { x: number; z: number } | null;
  }
  const candidates: Candidate[] = [];

  // Main room: a full AABB shrunk on all four sides.
  const main: SectionBounds = {
    minX: -H + margin,
    maxX: H - margin,
    minZ: -H + margin,
    maxZ: H - margin,
  };
  const mainArea = Math.max(0, main.maxX - main.minX) * Math.max(0, main.maxZ - main.minZ);
  if (mainArea > 0) candidates.push({ box: main, area: mainArea, center: null });

  if (layout) {
    const n = Math.min(unlockedSections, layout.sections.length);
    for (let i = 0; i < n; i++) {
      const section = layout.sections[i]!;
      const dir = DIRECTIONS[section.index]!;
      const center = centerExclusionRadius > 0 ? sectionCenter(section) : null;
      for (const b of section.boxes) {
        const s = shrinkBoxForDir(b, dir, margin);
        const area = Math.max(0, s.maxX - s.minX) * Math.max(0, s.maxZ - s.minZ);
        if (area > 0) candidates.push({ box: s, area, center });
      }
    }
  }

  let total = 0;
  for (const c of candidates) total += c.area;
  if (total <= 0) return null;

  // A few internal tries so the centre-exclusion rejection doesn't waste the
  // caller's (collision-checked) attempts.
  for (let attempt = 0; attempt < 8; attempt++) {
    let roll = rng() * total;
    let chosen = candidates[candidates.length - 1]!;
    for (const c of candidates) {
      if (roll < c.area) { chosen = c; break; }
      roll -= c.area;
    }
    const x = chosen.box.minX + rng() * (chosen.box.maxX - chosen.box.minX);
    const z = chosen.box.minZ + rng() * (chosen.box.maxZ - chosen.box.minZ);
    if (chosen.center) {
      const dx = x - chosen.center.x;
      const dz = z - chosen.center.z;
      if (dx * dx + dz * dz < centerExclusionRadius * centerExclusionRadius) continue;
    }
    return { x, z };
  }
  return null;
}

