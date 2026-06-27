/**
 * Tunable simulation and world constants shared by client and server.
 * The server is authoritative; the client uses these only for prediction and rendering.
 */

import type { CharacterClass } from './assets.js';

/** Registered Colyseus room handler names. */
export const ARENA_ROOM = 'arena';
export const TOWN_ROOM = 'town';
/** Zombie survival mode — the arena simulation under a distinct handler so its
 *  co-op rooms `joinOrCreate`-match each other and never mix with the public
 *  free-for-all arena. Registered against the same room class, with `mode:
 *  'zombie'` baked into the handler's options (see the server's `define`). */
export const ZOMBIE_ROOM = 'zombie';
/** Singleton lobby/matchmaking room: owns the replicated list of lobbies. */
export const MATCHMAKING_ROOM = 'matchmaking';
/** Singleton co-op Zombie matchmaking room: owns the replicated list of co-op
 *  zombie lobbies (separate from the team-vs-team {@link MATCHMAKING_ROOM}). */
export const ZOMBIE_MATCHMAKING_ROOM = 'zombie_matchmaking';

/** Town square half-extent in world units (matches the town map's `halfSize`). */
export const TOWN_HALF_SIZE = 46;

/** Server simulation rate (ticks per second). */
export const TICK_RATE = 20;

/** Fixed simulation timestep in milliseconds. */
export const TICK_MS = 1000 / TICK_RATE;

/** Arena half-extent along X (width) in world units; valid X range is [-ARENA_HALF_SIZE, ARENA_HALF_SIZE]. */
export const ARENA_HALF_SIZE = 25;

/** FFA arena half-extent along Z (north/south). The FFA arena is a RECTANGLE —
 *  longer N/S than it is wide — while zombie mode stays square (ARENA_HALF_SIZE)
 *  and grows via the room-expansion system instead. */
export const ARENA_HALF_Z = 38;

/**
 * The fixed central pond + island (FFA arena only — the one non-random feature).
 * A circular stone island sits in a water moat; the moat is impassable except via
 * two stone bridges (north +Z and south −Z, a clear lane of half-width `bridgeHalfW`
 * along X). The loot chest spawns on the island; nothing else spawns in this area.
 */
export const ARENA_POND = {
  x: 0,
  z: 0,
  /** Outer radius of the water moat. */
  pondR: 6.8,
  /** Radius of the walkable stone island at the centre. */
  islandR: 3.0,
  /** Half-width (along X) of the N/S bridge lane that crosses the moat. */
  bridgeHalfW: 1.7,
} as const;

// --- Zombie Room Expansion System ------------------------------------------------
// When the room system is active (zombie mode), the play area expands beyond the
// original 50×50 arena into a linear chain of sections extending northward.
// Doors between sections unlock as waves are cleared.
// ---------------------------------------------------------------------------------

/** Expanded half-extent (world units) for the zombie room system's total play area.
 *  The original arena sits at the centre; sections extend northward up to z ≈ 145. */
export const ZOMBIE_ROOM_HALF_SIZE = 150;


/** Which waves unlock each door (in order: Door 1 → Door 3). The wave's
 *  `onWaveClear` fires the unlock, adding the next section's cover and portals. */
export const DOOR_UNLOCK_WAVES: readonly number[] = [3, 6, 9, 12];

// --- Traps (zombie mode only) -----------------------------------------------
// A trap is a fixed 6-radius zone placed in a generated section. It "charges"
// from zombies dying inside it: when enough die within a short window it fires
// an effect (heal drop / fire field), then goes on cooldown. Placement
// alternates across sections (even indices host one) and the type is chosen
// deterministically from the match seed — see `trapForSection` in roomLayout.

/** Trap area radius (world units) — the visible ring and the death-count zone. */
export const TRAP_RADIUS = 6;

/** Rolling window (ms) over which qualifying zombie deaths are counted toward
 *  activation. Deaths older than this are pruned before each threshold check. */
export const TRAP_DEATH_WINDOW_MS = 6000;

/** Heal trap: drops a team-heal pickup (same as the mini-boss drop) when this
 *  many zombies die inside the radius within {@link TRAP_DEATH_WINDOW_MS}. */
export const HEAL_TRAP_THRESHOLD = 6;
/** Heal trap cooldown after it fires (2 minutes). */
export const HEAL_TRAP_COOLDOWN_MS = 2 * 60 * 1000;
/** Scale of the dropped heal pickup (matches the mini-boss heal drop). */
export const HEAL_TRAP_DROP_SCALE = 4;
/** HP restored to every living player when a heal trap fires (instant, area-wide
 *  — no pickup to grab; the beam IS the heal). */
export const HEAL_TRAP_HEAL = 100;

/** Death trap: releases a molotov-style fire field when this many zombies die
 *  inside the radius within {@link TRAP_DEATH_WINDOW_MS}. */
export const DEATH_TRAP_THRESHOLD = 6;
/** Death trap cooldown after it fires (2 minutes). */
export const DEATH_TRAP_COOLDOWN_MS = 2 * 60 * 1000;
/** Death trap fire field — molotov puddle behaviour, but sized to the full trap
 *  radius so the burning area matches the trap ring (VFX = damage area). The
 *  field is ownerless, so like a neutral explosion it burns anyone inside —
 *  zombies and players alike — so lure the horde in, then step out. */
export const DEATH_TRAP_FIRE = {
  radius: TRAP_RADIUS,
  tickDamage: 15,
  tickMs: 500,
  // Lingers far longer than a thrown molotov (5s) — a death trap is meant to
  // turn its whole section into a sustained kill zone for the horde.
  durationMs: 16000,
} as const;

/** Singularity trap: creates a gravity vortex when this many zombies die inside range. */
export const SINGULARITY_TRAP_THRESHOLD = 6;
/** Singularity trap cooldown (3 minutes). */
export const SINGULARITY_TRAP_COOLDOWN_MS = 3 * 60 * 1000;
/** Duration of the singularity vortex (6 seconds). */
export const SINGULARITY_DURATION_MS = 6000;
/** Damage dealt by the singularity explosion at the end. */
export const SINGULARITY_DAMAGE = 200;

/** Buff Core trap: grants a damage and mana overcharge zone when this many zombies die. */
export const BUFF_TRAP_THRESHOLD = 8;
/** Buff Core trap cooldown (3 minutes). */
export const BUFF_TRAP_COOLDOWN_MS = 3 * 60 * 1000;
/** Duration of the buff core zone (10 seconds). */
export const BUFF_DURATION_MS = 10000;
/** Duration of the buff status applied to players (3 seconds, refreshed while inside). */
export const BUFF_BUFF_DURATION_MS = 3000;
/** Ability damage multiplier granted by the buff trap (+150% extra damage). */
export const BUFF_TRAP_DAMAGE_MULT = 2.5;
/** Active zone effect radius for the buff trap. */
export const BUFF_TRAP_EFFECT_RADIUS = 9;

// --- Resonance of the Void: end-game altar / ritual / superweapon / boss ----
// Zombie-mode end-game loop (wave 13+). An Altar of Resonance rises at the room
// centre; four gem sockets light as traps auto-fire (any trap, any kind — only
// the count matters). With all 4 lit a player can channel a ritual at the altar
// to claim the Singularity Cannon superweapon. The Necrotic Titan arrives on a
// fixed wave no matter what, with a countdown running from the altar's spawn.

/** Wave the Altar of Resonance rises at the room centre. */
export const ALTAR_SPAWN_WAVE = 13;
/** Wave the Necrotic Titan spawns — fixed, regardless of ritual progress. The
 *  countdown HUD runs from {@link ALTAR_SPAWN_WAVE} to this. */
export const TITAN_SPAWN_WAVE = 16;
/** Altar world position (room centre; (0,0) is empty in the zombie room). */
export const ALTAR_POSITION = { x: 0, z: 0 } as const;
/** Prop asset id the altar is replicated/rendered as (a CoverStructure). */
export const ALTAR_ASSET_ID = 'prop.altar';
/** Solid obelisk collision footprint radius — players/zombies path around it. */
export const ALTAR_RADIUS = 1.4;
/** Visual height of the altar collider (Rapier static cylinder). */
export const ALTAR_HEIGHT = 3;
/** Walkable glowing ritual ring around the base — the channeller must stay
 *  inside this radius (solo cancels on leaving). Comfortably clears the obelisk. */
export const ALTAR_RITUAL_RADIUS = 3;
/** Gem sockets on the altar. Each trap auto-fire lights the next unlit one. */
export const ALTAR_GEM_COUNT = 4;

/** Ritual channel duration (ms) to claim the superweapon. */
export const RITUAL_CHANNEL_MS = 4000;
/** Mana drained per second while channelling. Regen is suppressed for the
 *  channel's duration so this actually bites: {@link RITUAL_CHANNEL_MS} at this
 *  rate = 80 mana total, so ~80 banked mana is required to finish. */
export const RITUAL_MANA_DRAIN_PER_SEC = 20;
/** Move-speed multiplier while channelling (multi-player only — 50% slow). */
export const RITUAL_SLOW_MAGNITUDE = 0.5;
/** Sprinters rushed at the channeller when the ritual starts (multi-player). */
export const RITUAL_RUSH_SPRINTERS = 8;
/** Sprinters rushed at a solo channeller (scaled down). */
export const RITUAL_SOLO_SPRINTERS = 3;
/** Solo only: radius of the opening shockwave that knocks back + stuns zombies. */
export const RITUAL_SOLO_SHOCKWAVE_RADIUS = 8;
/** Solo only: stun applied by the opening shockwave (ms). */
export const RITUAL_SOLO_SHOCKWAVE_STUN_MS = 2000;

/** The superweapon's id — stored in `Player.superweapon` while wielded; keys the
 *  ability-loadout override and the client action-bar / weapon-model swap. */
export const SUPERWEAPON_ID = 'singularity_cannon';

/** Soul Charges the Singularity Cannon comes loaded with. It uses no mana and
 *  takes no pickups; when charges hit 0 the weapon despawns and the class
 *  loadout returns. Tuned so a clean Titan kill spends ~70–80% of the bar. */
export const SUPERWEAPON_CHARGES = 600;
/** Charge cost per superweapon action (basic attack + the four ability slots). */
export const SUPERWEAPON_COST = {
  basic: 2,
  Q: 15,
  W: 10,
  E: 10,
  R: 50,
} as const;

/** Necrotic Titan skin id (a 2.5×-scaled boss zombie). */
export const TITAN_SKIN_ID = 'skin.zombie.titan';
/** Titan render scale — the mini-boss body (already 2.5×) rendered even larger so
 *  the Titan towers over it. */
export const TITAN_SCALE = 4;
/** Titan HP, base + per additional human. Solo 4000 → 5-player 14000. */
export const TITAN_BASE_HP = 4000;
export const TITAN_HP_PER_PLAYER = 2500;
/** HP the team must burst in 5s at the Titan's 50% gravity-well phase to break it. */
export const TITAN_STAGGER_DAMAGE = 2000;

/** Titan HP for a given count of present humans (min 1). */
export function titanHpForPlayers(humans: number): number {
  return TITAN_BASE_HP + Math.max(0, Math.floor(humans) - 1) * TITAN_HP_PER_PLAYER;
}


/** Player movement speed in world units per second. */
export const PLAYER_SPEED = 9;

/** Player collision/visual radius in world units. */
export const PLAYER_RADIUS = 0.5;

/** Starting and maximum player health. */
export const PLAYER_MAX_HP = 100;

/** Maximum players allowed in a single arena instance. */
export const MAX_PLAYERS = 16;

/** A cylindrical arena obstacle (pillar) with circular collision. */
export interface ArenaObstacle {
  x: number;
  z: number;
  radius: number;
  height: number;
  /** When false, the obstacle blocks player movement but NOT projectiles — used
   *  for the central pond moat, which players must walk around but shots fly over.
   *  Defaults to true (a normal solid obstacle) when omitted. */
  blockProjectiles?: boolean;
}

/** A spawn position on the arena floor. */
export interface SpawnPoint {
  x: number;
  z: number;
}

/**
 * A selectable arena layout: its obstacles and spawn points. Shared so the
 * server simulation, the client predictor, and the renderer all build from the
 * exact same geometry — the data-driven core of the Arena Builder (Phase 8.2).
 */
export interface ArenaLayout {
  id: string;
  displayName: string;
  obstacles: readonly ArenaObstacle[];
  spawnPoints: readonly SpawnPoint[];
}

export const ARENA_LAYOUTS = {
  /** The default: six scattered pillars favouring varied cover. */
  pillars: {
    id: 'pillars',
    displayName: 'Pillars',
    obstacles: [
      { x: 8, z: 6, radius: 1.2, height: 3 },
      { x: -7, z: 9, radius: 1.0, height: 2.4 },
      { x: -10, z: -6, radius: 1.4, height: 3.6 },
      { x: 7, z: -9, radius: 1.0, height: 2.2 },
      { x: 0, z: 13, radius: 1.6, height: 4 },
      { x: -14, z: 2, radius: 1.1, height: 2.8 },
    ],
    spawnPoints: [
      { x: 0, z: 18 },
      { x: 0, z: -18 },
      { x: 18, z: 0 },
      { x: -18, z: 0 },
    ],
  },
  /** A clear ring — pure positioning duels, no cover. */
  open: {
    id: 'open',
    displayName: 'Open',
    obstacles: [],
    spawnPoints: [
      { x: 16, z: 16 },
      { x: -16, z: -16 },
      { x: 16, z: -16 },
      { x: -16, z: 16 },
    ],
  },
  /** Four pillars in a plus — central chokepoints. */
  cross: {
    id: 'cross',
    displayName: 'Cross',
    obstacles: [
      { x: 0, z: 7, radius: 1.3, height: 3.2 },
      { x: 0, z: -7, radius: 1.3, height: 3.2 },
      { x: 7, z: 0, radius: 1.3, height: 3.2 },
      { x: -7, z: 0, radius: 1.3, height: 3.2 },
    ],
    spawnPoints: [
      { x: 0, z: 19 },
      { x: 0, z: -19 },
      { x: 19, z: 0 },
      { x: -19, z: 0 },
    ],
  },
  /**
   * The trailer-park battleground: trailers, burned cars, dumpsters, scrap
   * piles and drum clusters scattered as cover. Laid out with 180° rotational
   * symmetry so neither side has an advantage, while still reading as chaotic
   * junkyard clutter. Each circle here MUST have a matching visible prop in the
   * arena map (apps/client/src/assets/data/maps.ts) — same circle, same prop —
   * or you get an invisible wall (or a prop you can shoot/walk straight
   * through). `height` is only used by the legacy pillar renderer; the visuals
   * now come from the placed props, so it just mirrors each piece's rough mass.
   */
  trailerpark: {
    id: 'trailerpark',
    displayName: 'Trailer Park',
    obstacles: [
      { x: 10, z: 5, radius: 2, height: 2.8 }, // trailer
      { x: -10, z: -5, radius: 2, height: 2.8 }, // trailer (mirror)
      { x: -11, z: 8, radius: 2, height: 2.8 }, // trailer (teal)
      { x: 11, z: -8, radius: 2, height: 2.8 }, // trailer (mirror)
      { x: -5, z: -9, radius: 1.6, height: 1.7 }, // burned car
      { x: 5, z: 9, radius: 1.6, height: 1.7 }, // burned car (mirror)
      { x: 15, z: -2, radius: 1.3, height: 1.5 }, // dumpster
      { x: -15, z: 2, radius: 1.3, height: 1.5 }, // dumpster (mirror)
      { x: 2, z: 4, radius: 1.2, height: 1.4 }, // scrap pile
      { x: -2, z: -4, radius: 1.2, height: 1.4 }, // scrap pile (mirror)
      { x: 0, z: 12, radius: 1.1, height: 1 }, // oil-drum cluster
      { x: 0, z: -12, radius: 1.1, height: 1 }, // oil-drum cluster (mirror)
      { x: 8, z: 2, radius: 0.5, height: 1 }, // burning barrel
      { x: -8, z: -2, radius: 0.5, height: 1 }, // burning barrel (mirror)
      { x: 14, z: 10, radius: 0.5, height: 1 }, // burning barrel
      { x: -14, z: -10, radius: 0.5, height: 1 }, // burning barrel (mirror)
      { x: 12, z: 6, radius: 0.5, height: 1 }, // loose drum
      { x: -12, z: -6, radius: 0.5, height: 1 }, // loose drum (mirror)
    ],
    spawnPoints: [
      { x: 0, z: 18 },
      { x: 0, z: -18 },
      { x: 18, z: 0 },
      { x: -18, z: 0 },
    ],
  },
} as const satisfies Record<string, ArenaLayout>;

export type ArenaLayoutId = keyof typeof ARENA_LAYOUTS;

/** The layout the arena currently uses. Server and client must agree, so it
 *  lives here; per-room layout selection can override it in a later phase. */
export const ACTIVE_ARENA_LAYOUT: ArenaLayout = ARENA_LAYOUTS.trailerpark;

/** Active-layout obstacles. Shared so server, client prediction, and renderer
 *  all agree on exactly the same geometry. */
export const ARENA_OBSTACLES: readonly ArenaObstacle[] = ACTIVE_ARENA_LAYOUT.obstacles;

/** Active-layout spawn points (the server places players at these). */
export const ARENA_SPAWN_POINTS: readonly SpawnPoint[] = ACTIVE_ARENA_LAYOUT.spawnPoints;

/**
 * Push a point (a player's center) out of any overlapping obstacle so it rests
 * against the edge — a simple circle-vs-circle collision used identically by
 * the authoritative server and the client predictor.
 */
export function collideArenaObstacles(x: number, z: number): { x: number; z: number } {
  return pushOutOfCircles(x, z, ARENA_OBSTACLES);
}

/** Circle-vs-circle push-out shared by the arena and town colliders. */
function pushOutOfCircles(
  x: number,
  z: number,
  circles: readonly { x: number; z: number; radius: number }[],
): { x: number; z: number } {
  for (const o of circles) {
    const dx = x - o.x;
    const dz = z - o.z;
    const min = o.radius + PLAYER_RADIUS;
    const distSq = dx * dx + dz * dz;
    if (distSq < min * min && distSq > 1e-6) {
      const d = Math.sqrt(distSq);
      x = o.x + (dx / d) * min;
      z = o.z + (dz / d) * min;
    }
  }
  return { x, z };
}

/**
 * Lord British's castle — a large WALKABLE walled fortress spanning the back of
 * town (where the old city wall ran). Defined once here so the model (client
 * props.ts) and the collision ring below stay in sync. Centre is world-space;
 * tower/gate offsets are LOCAL to it. The front wall faces +z (toward town) with
 * a central gate gap you walk through into the bailey.
 */
export const CASTLE = {
  x: 0,
  z: -27,
  halfX: 21, // half width — reaches the old back-wall ends (±21.5)
  halfZ: 7, // half depth
  wallH: 6,
  wallT: 0.9,
  gateW: 5,
  gateH: 4.4,
} as const;

/** Tower placements local to the castle centre: four corners, mid-wall towers
 *  on the long walls, and two flanking the gate. r = base radius, h = shaft. */
export const CASTLE_TOWERS: readonly { x: number; z: number; r: number; h: number }[] = [
  { x: -21, z: 7, r: 1.7, h: 7 },
  { x: 21, z: 7, r: 1.7, h: 7 },
  { x: -21, z: -7, r: 1.7, h: 7 },
  { x: 21, z: -7, r: 1.7, h: 7 },
  { x: -10.5, z: 7, r: 1.4, h: 6.4 },
  { x: 10.5, z: 7, r: 1.4, h: 6.4 },
  { x: -10.5, z: -7, r: 1.4, h: 6.4 },
  { x: 10.5, z: -7, r: 1.4, h: 6.4 },
  { x: -3.3, z: 7, r: 1.3, h: 7.6 },
  { x: 3.3, z: 7, r: 1.3, h: 7.6 },
];

/** The castle's collision circles — curtain walls (with a gate gap), towers and
 *  the keep — generated from {@link CASTLE} so they always match the model. */
function castleColliders(): { x: number; z: number; radius: number }[] {
  const c = CASTLE;
  const out: { x: number; z: number; radius: number }[] = [];
  const WR = 1.9; // wall circle radius
  const STEP = 3;
  const gateHalf = c.gateW / 2 + 1; // keep wall circles clear of the gate
  for (let x = -c.halfX; x <= c.halfX + 0.001; x += STEP) {
    if (Math.abs(x) >= gateHalf) out.push({ x: c.x + x, z: c.z + c.halfZ, radius: WR }); // front
    out.push({ x: c.x + x, z: c.z - c.halfZ, radius: WR }); // back
  }
  for (let z = -c.halfZ; z <= c.halfZ + 0.001; z += STEP) {
    out.push({ x: c.x - c.halfX, z: c.z + z, radius: WR }); // left
    out.push({ x: c.x + c.halfX, z: c.z + z, radius: WR }); // right
  }
  for (const t of CASTLE_TOWERS) out.push({ x: c.x + t.x, z: c.z + t.z, radius: t.r });
  out.push({ x: c.x, z: c.z - c.halfZ + 3, radius: 3 }); // keep
  return out;
}

/**
 * Town collision circles, one per **solid, visible** prop (buildings, walls,
 * well, stalls, trees, rocks, the arch pillars). Radii are inscribed to the
 * footprint so you can walk right up to a wall but never through it — and there
 * are no colliders where there's nothing to see (no "ghost" obstacles). Keep in
 * sync with the town layout in `apps/client/src/assets/data/maps.ts`.
 */
export const TOWN_OBSTACLES: readonly { x: number; z: number; radius: number }[] = [
  // Castle (a big walkable fortress) — curtain walls with a gate gap, towers and
  // keep, generated to match the model. It now spans the whole back of town, so
  // the old separate city-wall colliders are gone.
  ...castleColliders(),
  // Buildings.
  { x: -13, z: 5.5, radius: 2.4 }, // inn
  { x: 13, z: 6, radius: 1.7 }, // smithy
  { x: -20, z: -16, radius: 1.5 }, // tower
  { x: 20, z: -16, radius: 1.5 }, // tower
  { x: 13, z: -9, radius: 1.6 },
  { x: -13, z: -10, radius: 1.5 },
  { x: -16, z: 15, radius: 1.6 },
  { x: 16, z: 16, radius: 1.5 },
  { x: 19, z: -2, radius: 1.6 },
  { x: -19, z: -3, radius: 1.5 },
  { x: -10, z: 23, radius: 1.6 },
  { x: 10, z: 24, radius: 1.5 },
  // Town centre & furniture.
  { x: 0, z: -2, radius: 3.1 }, // fountain (basin footprint)
  { x: 5, z: 5, radius: 1.3 }, // stall
  { x: -5, z: 6, radius: 1.3 }, // stall
  { x: 7, z: 2, radius: 0.9 }, // cart
  { x: -8.5, z: 4, radius: 0.5 }, // barrel
  { x: 10, z: 7.5, radius: 0.5 }, // barrel
  { x: 6, z: 6.5, radius: 0.5 }, // crate
  { x: -6, z: 7.5, radius: 0.5 }, // crate
  // Trees & rocks (trunk/boulder footprint only).
  { x: -24, z: 10, radius: 0.5 },
  { x: 24, z: 12, radius: 0.45 },
  { x: 0, z: 27, radius: 0.5 },
  { x: -9, z: 30, radius: 0.45 },
  { x: -25, z: -8, radius: 0.45 },
  { x: 25, z: -10, radius: 0.45 },
  { x: -22, z: 22, radius: 0.45 },
  { x: 22, z: 24, radius: 0.45 },
  { x: 11, z: 30, radius: 0.45 },
  { x: -26, z: 2, radius: 0.85 },
  { x: 26, z: 4, radius: 1 },
  { x: 16, z: -18, radius: 0.85 },
  { x: -16, z: -19, radius: 1 },
  // Extra greenery covering the grassy square — trees, pines, boulders (keep in sync with maps.ts).
  { x: -36.5, z: -35, radius: 0.5 },
  { x: -34.4, z: -14.4, radius: 0.5 },
  { x: -35.8, z: 32.7, radius: 0.95 },
  { x: -27.5, z: -29.3, radius: 0.5 },
  { x: -30.4, z: -16.9, radius: 0.5 },
  { x: -32.7, z: -4.2, radius: 0.5 },
  { x: -27.9, z: 5.6, radius: 0.85 },
  { x: -34.1, z: 15.9, radius: 0.95 },
  { x: -33, z: 29.3, radius: 0.5 },
  { x: -22, z: -34.8, radius: 0.5 },
  { x: -20.2, z: -18.5, radius: 0.85 },
  { x: -20.3, z: -12.2, radius: 0.5 },
  { x: -21.1, z: -0.8, radius: 0.5 },
  { x: -20.8, z: 17.6, radius: 0.85 },
  { x: -22.2, z: 33.8, radius: 0.85 },
  { x: -15, z: -7.8, radius: 0.5 },
  { x: -13.9, z: 29, radius: 0.5 },
  { x: -6.3, z: -16.4, radius: 0.5 },
  { x: -12.1, z: -13, radius: 0.5 },
  { x: -16.5, z: 5.5, radius: 0.5 },
  { x: -5.3, z: -21.7, radius: 0.95 },
  { x: -5.5, z: 15.1, radius: 0.85 },
  { x: 7.5, z: -19.8, radius: 0.5 },
  { x: 1.8, z: 19.8, radius: 0.95 },
  { x: 13.6, z: -35, radius: 0.95 },
  { x: 13.2, z: -24.4, radius: 0.5 },
  { x: 20.2, z: -36.9, radius: 0.5 },
  { x: 17.2, z: -12.1, radius: 0.5 },
  { x: 18.6, z: 5.7, radius: 0.5 },
  { x: 21, z: 16.2, radius: 0.5 },
  { x: 19.7, z: 30.6, radius: 0.85 },
  { x: 29, z: -29.3, radius: 0.5 },
  { x: 28.8, z: -18.6, radius: 0.95 },
  { x: 26.9, z: -2.7, radius: 0.5 },
  { x: 28.4, z: 21.9, radius: 0.7 },
  { x: 28.3, z: 35.2, radius: 0.7 },
  { x: 32.4, z: -31.6, radius: 0.5 },
  { x: 35.2, z: -21.6, radius: 0.95 },
  { x: 32.7, z: -16.9, radius: 0.85 },
  { x: 34.7, z: -8.4, radius: 0.5 },
  { x: 35.6, z: -1.9, radius: 0.5 },
  { x: 33.8, z: 6.2, radius: 0.5 },
  { x: 30.6, z: 9.2, radius: 0.85 },
];

/** Push a player center out of any town prop they overlap. Mirrors the arena. */
export function collideTownObstacles(x: number, z: number): { x: number; z: number } {
  return pushOutOfCircles(x, z, TOWN_OBSTACLES);
}

/** Player movement speed while sprinting, in world units per second. */
export const SPRINT_SPEED = 9;

/** Downward acceleration, world units per second². */
export const GRAVITY = 24;

/** Upward launch velocity applied on jump, world units per second. */
export const JUMP_FORCE = 8.5;

/** World Y of the ground plane the players' feet rest on. */
export const GROUND_Y = 0;

/** Starting and maximum player mana. */
export const PLAYER_MAX_MANA = 100;

/** Mana restored per second. */
export const MANA_REGEN = 12;

/** Mana regenerates this much faster in zombie mode (survival leans on abilities,
 *  so casters refill quicker). */
export const ZOMBIE_MANA_REGEN_MULT = 1.5;

/** Delay before a defeated player respawns, in milliseconds. */
export const RESPAWN_DELAY_MS = 4000;

/** XP awarded to the killer for a kill (progression / persistence). */
export const XP_PER_KILL = 50;

/** Kills needed to win a ranked 1v1 match (first to this total). */
export const MATCH_KILL_TARGET = 5;

// ---------------------------------------------------------------------------
// Lobby matchmaking (1v1 → 5v5) — team modes, ready-check, per-team spawns.
// ---------------------------------------------------------------------------

/** The two sides every lobby/match is split into. */
export type Team = 'blue' | 'red';

/** A team id guard (rejects anything that isn't 'blue'|'red'). */
export function isTeam(value: unknown): value is Team {
  return value === 'blue' || value === 'red';
}

/** The match sizes a lobby can be created at, smallest first. */
export const LOBBY_MODES = ['1v1', '2v2', '3v3', '4v4', '5v5'] as const;
export type LobbyMode = (typeof LOBBY_MODES)[number];

export function isLobbyMode(value: unknown): value is LobbyMode {
  return typeof value === 'string' && (LOBBY_MODES as readonly string[]).includes(value);
}

/** Players per team for a mode ('3v3' → 3). The total match size is twice this. */
export function teamSizeForMode(mode: LobbyMode): number {
  return Number(mode.charAt(0));
}

/** Combined kills a team must reach to win, scaled so per-player pace is constant
 *  (1v1 → 5, 3v3 → 15) — see {@link MATCH_KILL_TARGET}. */
export function teamKillTargetFor(mode: LobbyMode): number {
  return MATCH_KILL_TARGET * teamSizeForMode(mode);
}

/** How long every participant has to accept a full lobby's ready-check (ms). */
export const READY_CHECK_MS = 30000;

/** PvP queue: if a format's queue can't fill with real players within this long,
 *  the match starts with practice bots filling the remaining slots. */
export const QUEUE_BOT_FILL_MS = 60000;

/** Maximum accepted lobby name length. */
export const LOBBY_NAME_MAX_LENGTH = 32;

/** Hard cap on concurrent lobbies (a runaway-creation backstop). */
export const MAX_LOBBIES = 50;

// ---------------------------------------------------------------------------
// Co-op Zombie matchmaking — one shared squad (up to 5) holds out against the
// horde. Rooms are public (listed) or private (hidden, joined by a share code);
// the host launches when ready (1–5 players). See ZombieMatchmakingRoom.
// ---------------------------------------------------------------------------

/** Max players in a co-op zombie squad. */
export const ZOMBIE_COOP_MAX_PLAYERS = 5;

/** Length of a private co-op lobby's share code (uppercase letters + digits). */
export const ZOMBIE_LOBBY_CODE_LENGTH = 4;

/** Alphabet for share codes — omits easily-confused chars (0/O, 1/I). */
export const ZOMBIE_LOBBY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * WebSocket close code the server uses when a newer session for the same account
 * supersedes this connection ("newest wins"). In the app-defined range (≥4000)
 * so the client can recognise it and show a friendly notice instead of a generic
 * disconnect.
 */
export const SESSION_SUPERSEDED_CODE = 4001;

/**
 * Per-team arena spawn anchors, one cluster per side (blue at +Z, red at −Z),
 * each fanning out to five points so a full 5v5 doesn't stack. The server jitters
 * and obstacle-resolves these, so they only need to be roughly on their side and
 * inside the arena bounds.
 */
const BLUE_SPAWNS: readonly SpawnPoint[] = [
  { x: 0, z: 18 },
  { x: -7, z: 19 },
  { x: 7, z: 19 },
  { x: -13, z: 16 },
  { x: 13, z: 16 },
];
const RED_SPAWNS: readonly SpawnPoint[] = [
  { x: 0, z: -18 },
  { x: -7, z: -19 },
  { x: 7, z: -19 },
  { x: -13, z: -16 },
  { x: 13, z: -16 },
];

/** Spawn anchors for a team (blue at +Z, red at −Z). */
export function arenaSpawnsForTeam(team: Team): readonly SpawnPoint[] {
  return team === 'red' ? RED_SPAWNS : BLUE_SPAWNS;
}

// ---------------------------------------------------------------------------
// Zombie survival mode — endless, escalating hordes that pour out of the arena
// portal and chase the players. Each level is one horde; clearing it (every
// zombie dead) starts the next, with a LINEARLY larger horde (capped so endless
// high levels stay playable). Shared so the server's wave director and the
// client's HUD agree on the curve.
// ---------------------------------------------------------------------------

/** Mode tag carried in the room's `onCreate` options for a zombie room. */
export const ZOMBIE_MODE = 'zombie';

/**
 * Where zombies spawn from: the arena's town portal (its return-to-town gate at
 * the −Z edge — the visible gateway in the arena map). They stream out of here
 * and hunt the players, who spawn at the opposite (+Z) end.
 */
export const ARENA_PORTAL_POINT: SpawnPoint = { x: 0, z: -ARENA_HALF_SIZE + 2 };

/** Lateral inset (world units) for the flanking zombie portals — just inside the
 *  side walls, mirroring the back gate's 2-unit inset. */
const PORTAL_EDGE = ARENA_HALF_SIZE - 2;
/** Z offset of the corner ("angle") portals along each side edge. */
const PORTAL_CORNER = ARENA_HALF_SIZE - 4;

/**
 * Extra zombie spawn portals (zombie mode only): three down each lateral edge —
 * one centered, two at the corners — so hordes flank in from the left (−X) and
 * right (+X) sides as well as the back gate ({@link ARENA_PORTAL_POINT}). Drawn
 * by the client as sickly-green gateways and used by the server to scatter
 * spawns; kept clear of cover by the layout generator.
 */
export const ZOMBIE_FLANK_PORTALS: readonly SpawnPoint[] = [
  { x: -PORTAL_EDGE, z: -PORTAL_CORNER },
  { x: -PORTAL_EDGE, z: 0 },
  { x: -PORTAL_EDGE, z: PORTAL_CORNER },
  { x: PORTAL_EDGE, z: -PORTAL_CORNER },
  { x: PORTAL_EDGE, z: 0 },
  { x: PORTAL_EDGE, z: PORTAL_CORNER },
];

/** Every point a zombie can pour out of in zombie mode: the back gate plus the
 *  flanking side portals. The server picks one at random per spawn. */
export const ZOMBIE_SPAWN_PORTALS: readonly SpawnPoint[] = [
  ARENA_PORTAL_POINT,
  ...ZOMBIE_FLANK_PORTALS,
];

/** Zombies in the first level's horde (level 1). */
export const ZOMBIE_BASE_HORDE = 12;
/** Added to the horde size each level — linear growth (lvl L ⇒ base + (L-1)·step).
 *  Trimmed so the early run (levels 1–6) isn't a slog of sheer numbers; pressure
 *  now comes more from how many close in at once (see {@link ZOMBIE_MAX_ALIVE_PER_LEVEL}). */
export const ZOMBIE_HORDE_PER_LEVEL = 12;
/** Ceiling on a level's horde size, so endless high levels don't balloon past
 *  what's playable (reached around level 21 with the values above). */
export const ZOMBIE_MAX_HORDE = 250;
/**
 * The concurrent-alive ("closing in") cap scales with level, with NO ceiling:
 * later levels swarm harder. A level's horde streams in — spawns pause at this
 * cap and resume as zombies die — so the cap shapes pressure while the total
 * (above) shapes length. Effectively bounded by the level's horde size.
 */
export const ZOMBIE_BASE_MAX_ALIVE = 16;
/** Added to the concurrent-alive cap each level — the "closing in" count ramps up
 *  faster than the horde total, so later levels swarm harder even as totals stay
 *  trimmed. */
export const ZOMBIE_MAX_ALIVE_PER_LEVEL = 4;
/** Zombies released per spawn pulse (a trickle out of the portal). */
export const ZOMBIE_SPAWN_BATCH = 2;
/** Delay between spawn pulses is randomized within this range (ms) so a horde
 *  pours out unevenly — bursts and lulls instead of a metronomic trickle. */
export const ZOMBIE_SPAWN_INTERVAL_MIN_MS = 350;
export const ZOMBIE_SPAWN_INTERVAL_MAX_MS = 1100;
/** Zombie base chase/move speed (world units/second) — a slow shamble, well
 *  under a player's pace, so early hordes threaten by numbers, not speed. */
export const ZOMBIE_SPEED = 4;
/** Zombies speed up by 1 unit/s every this many levels (so the shamble ramps
 *  toward a genuine chase as the run wears on). */
export const ZOMBIE_SPEED_LEVEL_STEP = 4;
/** Per-zombie speed is jittered by ±this (world units/s, rolled at spawn) so a
 *  horde doesn't move as one block — some shamble, some lunge ahead. */
export const ZOMBIE_SPEED_JITTER = 1;

// --- Chase wander: each zombie COMMITS to a flank side and arcs around its prey
//     rather than trailing in a straight line — so a horde splits and swarms you
//     from multiple angles instead of forming one easy-to-lead conga line. The
//     arc shrinks to nothing as they close to attack range (the ramp), so they
//     still spiral in and strike. A zombie keeps its side; only the magnitude
//     re-rolls now and then.
/** Max steering angle off the bee-line to the target, in radians (~63°) — a wide
 *  arc so they curl around to surround. */
export const ZOMBIE_WANDER_MAX_RAD = 1.1;
/** Distance (world units) over which the wander ramps in: full at this far out,
 *  zero at attack range. Larger = they start curving around from further away. */
export const ZOMBIE_WANDER_FALLOFF = 13;
/** A zombie re-picks its wander bias on a randomized interval in this range (ms). */
export const ZOMBIE_WANDER_REROLL_MIN_MS = 1500;
export const ZOMBIE_WANDER_REROLL_MAX_MS = 4000;

// --- Stuck-detection reroute -------------------------------------------------
// Zombies have no pathfinding; they bee-line (plus the wander arc) at the target.
// Against wide / multi-circle cover the collision push-out can trap them
// oscillating at a surface. When a chasing zombie stops making net progress for a
// short window, it commits to a forced ~perpendicular detour to slide off the
// obstacle, then resumes the bee-line — a cheap one-obstacle escape, not a navmesh.
/** Net movement per tick (world units) below which a chasing zombie counts as
 *  not progressing. Well under a normal ~0.2u/tick step. */
export const ZOMBIE_STUCK_MOVE_EPS = 0.06;
/** Consecutive non-progress ticks before committing a detour (~0.75s at 20Hz). */
export const ZOMBIE_STUCK_TICKS = 15;
/** How long a committed detour steers perpendicular before re-evaluating (ms). */
export const ZOMBIE_DETOUR_MS = 700;
/** The detour heading offset off the bee-line, in radians (~80°). */
export const ZOMBIE_DETOUR_RAD = 1.4;
/** XP a player earns for killing a (normal) zombie — far less than a player kill
 *  ({@link XP_PER_KILL}), so grinding hordes doesn't trivialise progression.
 *  Tougher variants are worth more (see below). */
export const ZOMBIE_XP_PER_KILL = 10;
/** XP for killing a Sprinter (fast/fragile) — slightly above a normal zombie. */
export const ZOMBIE_SPRINTER_XP = 15;
/** XP for killing a Fat (slow/tanky) — more than a Sprinter for the effort. */
export const ZOMBIE_FAT_XP = 20;
/** XP a Mini-Boss kill awards — granted to EVERY member of the killer's team
 *  (not just the killer), since it's a shared objective for the squad. */
export const ZOMBIE_MINIBOSS_XP = 100;
/** Skin id the server tags zombies with; the client maps it to a stylized
 *  primitive zombie body (see client `data/zombies.ts`) in place of the warrior. */
export const ZOMBIE_SKIN_ID = 'skin.zombie';
/** Skin id for the Sprinter variant; the client maps it to a lean primitive body.
 *  A fast, fragile rusher (see below). */
export const ZOMBIE_SPRINTER_SKIN_ID = 'skin.zombie.sprinter';
/** Chance a horde slot spawns a Sprinter in place of a normal zombie. */
export const ZOMBIE_SPRINTER_SPAWN_CHANCE = 0.35;
/** A Sprinter moves this much faster (world units/s) than a same-level zombie —
 *  a random amount in this range is rolled per spawn. */
export const ZOMBIE_SPRINTER_SPEED_MIN = 2;
export const ZOMBIE_SPRINTER_SPEED_MAX = 3;
/** A Sprinter carries this fraction of a same-level zombie's health (a bit less). */
export const ZOMBIE_SPRINTER_HP_MULT = 0.7;

/** Skin id for the Fat variant; the client maps it to its (bulky) model. A
 *  slow, heavily-armoured tank — lots of health, slightly quicker swings. */
export const ZOMBIE_FAT_SKIN_ID = 'skin.zombie.fat';
/** Skin id for the Mini-Boss variant. */
export const ZOMBIE_MINIBOSS_SKIN_ID = 'skin.zombie.miniboss';
/** A Fat has this many times a same-level zombie's health. */
export const ZOMBIE_FAT_HP_MULT = 3;
/** Flat health shaved off a Fat after the multiplier (tuning down its bulk). */
export const ZOMBIE_FAT_HP_REDUCTION = 50;
/** A Fat moves this much slower (world units/s) than a same-level zombie. */
export const ZOMBIE_FAT_SPEED_PENALTY = 0.8;
/** A Fat's swing lands this many ms sooner than a normal zombie's (0.2s faster). */
export const ZOMBIE_FAT_ATTACK_BONUS_MS = 200;
/** Chance a horde slot spawns a Fat in place of a normal zombie — flat at every
 *  level (no per-level scaling). */
export const ZOMBIE_FAT_SPAWN_CHANCE = 0.16;
/** Breather between a cleared level and the next horde, in milliseconds. */
export const ZOMBIE_LEVEL_BREAK_MS = 5000;
/** Grace before the first horde so the player can get oriented, in milliseconds. */
export const ZOMBIE_FIRST_DELAY_MS = 3000;
/** A zombie strike lands on a randomized interval in this range (ms) — while in
 *  range of a player it swings at any random moment between these two bounds (not
 *  the class auto-attack timer). */
export const ZOMBIE_ATTACK_MIN_MS = 400;
export const ZOMBIE_ATTACK_MAX_MS = 3500;
/** Wind-up before a zombie's FIRST swing after reaching its prey, in ms — so it
 *  doesn't bite the instant it's in range (it rears back, giving a beat to react
 *  or step away). Re-armed each time it closes back into range. */
export const ZOMBIE_ATTACK_WINDUP_MS = 500;
/** A zombie's base health (level 1). Low — hordes are a threat by numbers. */
export const ZOMBIE_BASE_HP = 45;
/** Added to a zombie's health per level, so later hordes are also tougher. */
export const ZOMBIE_HP_PER_LEVEL = 6;
/** How long a slain zombie's corpse lingers (death pose) before removal, in ms. */
export const ZOMBIE_CORPSE_MS = 800;

/** Total zombies in the horde for `level` (linear growth, capped). */
export function zombieHordeSize(level: number): number {
  if (level < 1) return 0;
  return Math.min(ZOMBIE_MAX_HORDE, ZOMBIE_BASE_HORDE + ZOMBIE_HORDE_PER_LEVEL * (level - 1));
}

/** Hard ceiling on concurrent-alive zombies — keeps the horde (and the per-tick
 *  cost + client model count) bounded no matter how high the level climbs. */
export const ZOMBIE_MAX_ALIVE_CAP = 36;

/** Zombies allowed alive at once at `level` (scales with level, capped). */
export function zombieMaxAlive(level: number): number {
  return Math.min(
    ZOMBIE_MAX_ALIVE_CAP,
    ZOMBIE_BASE_MAX_ALIVE + ZOMBIE_MAX_ALIVE_PER_LEVEL * Math.max(0, level - 1),
  );
}

/** A zombie's max health at `level` (base + linear per-level toughening). */
export function zombieHealthForLevel(level: number): number {
  return ZOMBIE_BASE_HP + Math.max(0, level - 1) * ZOMBIE_HP_PER_LEVEL;
}

/** A Sprinter's max health at `level` — a fraction of a normal zombie's. */
export function zombieSprinterHealthForLevel(level: number): number {
  return Math.max(1, Math.round(zombieHealthForLevel(level) * ZOMBIE_SPRINTER_HP_MULT));
}

/** A Fat's max health at `level` — a multiple of a normal zombie's, less a flat
 *  reduction (clamped to at least 1). */
export function zombieFatHealthForLevel(level: number): number {
  return Math.max(
    1,
    Math.round(zombieHealthForLevel(level) * ZOMBIE_FAT_HP_MULT) - ZOMBIE_FAT_HP_REDUCTION,
  );
}

/** Chance a horde slot spawns a Fat — a flat 16% at every level (no scaling). */
export function zombieFatChanceForLevel(_level: number): number {
  return ZOMBIE_FAT_SPAWN_CHANCE;
}

/** True for any zombie-family skin (base zombie, Sprinter, or Fat) — wave enemies
 *  that grant reduced XP and don't count as PvP kills. */
export function isZombieSkin(skinId: string): boolean {
  return (
    skinId === ZOMBIE_SKIN_ID ||
    skinId === ZOMBIE_SPRINTER_SKIN_ID ||
    skinId === ZOMBIE_FAT_SKIN_ID ||
    skinId === ZOMBIE_MINIBOSS_SKIN_ID ||
    skinId === TITAN_SKIN_ID
  );
}

/** A zombie's move speed at `level`: base, stepped up by 1 every
 *  {@link ZOMBIE_SPEED_LEVEL_STEP} levels (lvl 1–4 → 4, 5–8 → 5, …). */
export function zombieSpeedForLevel(level: number): number {
  return ZOMBIE_SPEED + Math.floor(Math.max(0, level - 1) / ZOMBIE_SPEED_LEVEL_STEP);
}

/** How long an emote (dance) plays before returning to idle, in milliseconds. */
export const EMOTE_MS = 5000;

/**
 * How long a finished ranked room lingers on the results screen before the
 * server force-disposes it. Clients normally return to town on their own well
 * within this window; this is the backstop so abandoned rooms don't leak.
 */
export const MATCH_RESULT_LINGER_MS = 20000;

/**
 * How long the post-match rematch vote stays open. If the whole group hasn't
 * accepted by then, the rematch lapses and everyone is sent back to town. Sized
 * so players have time to read the scoreboard and decide without the room lingering.
 */
export const REMATCH_WINDOW_MS = 30000;

/**
 * Level curve, shared by server (persistence) and client (HUD). Each level needs
 * quadratically more XP: lvl 1 at 0, 2 at 100, 3 at 400, 4 at 900 … so
 * `xpForLevel(L) = 100·(L-1)²` and `levelForXp` is its inverse.
 */
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

/** Total XP required to reach `level` (the start of that level's bar). */
export function xpForLevel(level: number): number {
  return 100 * Math.max(0, level - 1) ** 2;
}

/**
 * A player's progress through their current level: the bar's `span` (XP needed
 * for this level), how far `into` it they are, and the 0–1 `fraction`. Used by
 * the player card and paperdoll to draw the XP bar.
 */
export function xpProgress(
  level: number,
  xp: number,
): { start: number; end: number; span: number; into: number; fraction: number } {
  const start = xpForLevel(level);
  const end = xpForLevel(level + 1);
  const span = Math.max(1, end - start);
  const into = Math.max(0, Math.min(span, xp - start));
  return { start, end, span, into, fraction: into / span };
}

/** Hard cap on a projectile's lifetime, in milliseconds. */
export const PROJECTILE_LIFETIME_MS = 3000;

/** Mouse-move: how close (world units) to the destination counts as arrived. */
export const CLICK_STOPPING_DISTANCE = 0.1;

/** Mouse-move: how fast a player turns to face its movement direction (1/second). */
export const CLICK_ROTATION_SPEED = 10;

/** Mouse-move: cursor distance (world units) beyond which the player sprints. */
export const CLICK_SPRINT_THRESHOLD = 1.5;

// ---------------------------------------------------------------------------
// Abilities — the system now lives in `./abilities/`. The composable effect
// vocabulary + ability shape are in `abilities/effects.ts`; the catalog, ids,
// slots and per-class loadouts are in `abilities/registry.ts`. Re-exported here
// so existing imports (`@arena/shared`) keep resolving these names unchanged.
// ---------------------------------------------------------------------------

export type {
  AbilityAim,
  AbilityConfig,
  AbilityDef,
  Effect,
  LeafEffect,
  StatusKind,
  StatusSpec,
} from './abilities/effects.js';
export { STATUS_KINDS } from './abilities/effects.js';
export type { AbilityTooltip } from './abilities/describe.js';
export { describeAbility } from './abilities/describe.js';

export type { AbilityId, AbilityKind, AbilitySlot } from './abilities/registry.js';
export {
  ABILITIES,
  ABILITY_KINDS,
  ABILITY_REGISTRY,
  ABILITY_SLOTS,
  CLASS_LOADOUTS,
  SUPERWEAPON_LOADOUT,
  slotForAbility,
  isAbilityKind,
} from './abilities/registry.js';

// ---------------------------------------------------------------------------
// Auto-attacks — click an enemy to attack-move and strike on a timer.
// ---------------------------------------------------------------------------

export type AutoAttackKind = 'ranged' | 'melee';

/** Per-class basic attack. Server-authoritative; no mana, no cooldown UI. */
export interface AutoAttackConfig {
  kind: AutoAttackKind;
  /** Max center-to-center distance (world units) at which the attack lands. */
  range: number;
  damage: number;
  /** Attack interval (attack speed), in milliseconds. */
  cooldownMs: number;
  /** Projectile speed (ranged only), world units/second. */
  projectileSpeed?: number;
  /** Projectile collision radius (ranged only). */
  projectileRadius?: number;
  /** Projectile VFX tag the client maps to a visual (ranged only). */
  projectileVfx?: string;
}

export const AUTO_ATTACKS: Record<CharacterClass, AutoAttackConfig> = {
  warrior: { kind: 'melee', range: 2.6, damage: 11, cooldownMs: 800 },
  priest: { kind: 'melee', range: 2.6, damage: 7, cooldownMs: 900 },
  mage: {
    kind: 'ranged',
    range: 7,
    damage: 9,
    cooldownMs: 1000,
    projectileSpeed: 25,
    projectileRadius: 0.5,
    projectileVfx: 'auto_bolt',
  },
  archer: {
    kind: 'ranged',
    range: 8,
    damage: 12,
    cooldownMs: 750,
    projectileSpeed: 25,
    projectileRadius: 0.4,
    projectileVfx: 'auto_arrow',
  },
  ninja: { kind: 'melee', range: 2.6, damage: 10, cooldownMs: 700 },
};

