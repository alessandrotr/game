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

/** Town square half-extent in world units (matches the town map's `halfSize`). */
export const TOWN_HALF_SIZE = 46;

/** Server simulation rate (ticks per second). */
export const TICK_RATE = 20;

/** Fixed simulation timestep in milliseconds. */
export const TICK_MS = 1000 / TICK_RATE;

/** Square arena half-extent in world units; valid X/Z range is [-ARENA_HALF_SIZE, ARENA_HALF_SIZE]. */
export const ARENA_HALF_SIZE = 25;

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
 * Town collision circles, one per **solid, visible** prop (buildings, walls,
 * well, stalls, trees, rocks, the arch pillars). Radii are inscribed to the
 * footprint so you can walk right up to a wall but never through it — and there
 * are no colliders where there's nothing to see (no "ghost" obstacles). Keep in
 * sync with the town layout in `apps/client/src/assets/data/maps.ts`.
 */
export const TOWN_OBSTACLES: readonly { x: number; z: number; radius: number }[] = [
  // Castle + city walls.
  { x: 0, z: -27, radius: 5 },
  { x: -9, z: -29, radius: 2.5 },
  { x: -14, z: -29, radius: 2.5 },
  { x: -19, z: -29, radius: 2.5 },
  { x: 9, z: -29, radius: 2.5 },
  { x: 14, z: -29, radius: 2.5 },
  { x: 19, z: -29, radius: 2.5 },
  { x: -21.5, z: -25.5, radius: 2.5 },
  { x: 21.5, z: -25.5, radius: 2.5 },
  // Buildings.
  { x: -13, z: 2, radius: 2.4 }, // inn
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
  { x: -12.4, z: 5.4, radius: 0.5 },
  { x: -5.3, z: -21.7, radius: 0.95 },
  { x: -5.5, z: 15.1, radius: 0.85 },
  { x: 7.5, z: -19.8, radius: 0.5 },
  { x: 1.8, z: 19.8, radius: 0.95 },
  { x: 13.6, z: -35, radius: 0.95 },
  { x: 13.2, z: -24.4, radius: 0.5 },
  { x: 12.9, z: -1.4, radius: 0.5 },
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

/** Maximum accepted lobby name length. */
export const LOBBY_NAME_MAX_LENGTH = 32;

/** Hard cap on concurrent lobbies (a runaway-creation backstop). */
export const MAX_LOBBIES = 50;

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
// zombie dead) starts the next, with an exponentially larger horde. Shared so
// the server's wave director and the client's HUD agree on the curve.
// ---------------------------------------------------------------------------

/** Mode tag carried in the room's `onCreate` options for a zombie room. */
export const ZOMBIE_MODE = 'zombie';

/**
 * Where zombies spawn from: the arena's town portal (its return-to-town gate at
 * the −Z edge — the visible gateway in the arena map). They stream out of here
 * and hunt the players, who spawn at the opposite (+Z) end.
 */
export const ARENA_PORTAL_POINT: SpawnPoint = { x: 0, z: -ARENA_HALF_SIZE + 2 };

/** Zombies in the first level's horde (level 1). */
export const ZOMBIE_BASE_HORDE = 5;
/** Per-level multiplier on the horde size — the count grows exponentially. */
export const ZOMBIE_GROWTH = 1.5;
/**
 * Hard cap on zombies alive at once. The horde for high levels can be huge, so
 * it streams in: spawns pause at this cap and resume as zombies die, until the
 * level's whole quota has been sent. Keeps entity counts (and the sim cost)
 * bounded no matter how high the level climbs.
 */
export const ZOMBIE_MAX_ALIVE = 24;
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
/** XP a player earns for killing a zombie — far less than a player kill
 *  ({@link XP_PER_KILL}), so grinding hordes doesn't trivialise progression. */
export const ZOMBIE_XP_PER_KILL = 10;
/** Skin id the server tags zombies with; the client maps it to the zombie GLB
 *  (a Mixamo-rigged shambling model) in place of the warrior body. */
export const ZOMBIE_SKIN_ID = 'skin.zombie';
/** Breather between a cleared level and the next horde, in milliseconds. */
export const ZOMBIE_LEVEL_BREAK_MS = 5000;
/** Grace before the first horde so the player can get oriented, in milliseconds. */
export const ZOMBIE_FIRST_DELAY_MS = 3000;
/** A zombie's base health (level 1). Low — hordes are a threat by numbers. */
export const ZOMBIE_BASE_HP = 45;
/** Added to a zombie's health per level, so later hordes are also tougher. */
export const ZOMBIE_HP_PER_LEVEL = 6;
/** How long a slain zombie's corpse lingers (death pose) before removal, in ms. */
export const ZOMBIE_CORPSE_MS = 800;

/** Total zombies in the horde for `level` (exponential growth, rounded). */
export function zombieHordeSize(level: number): number {
  if (level < 1) return 0;
  return Math.round(ZOMBIE_BASE_HORDE * ZOMBIE_GROWTH ** (level - 1));
}

/** A zombie's max health at `level` (base + linear per-level toughening). */
export function zombieHealthForLevel(level: number): number {
  return ZOMBIE_BASE_HP + Math.max(0, level - 1) * ZOMBIE_HP_PER_LEVEL;
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
};
