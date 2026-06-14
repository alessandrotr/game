/**
 * Plain, transport-agnostic shapes that mirror the authoritative Colyseus schema.
 * The client uses these to read replicated state with full type-safety without
 * depending on `@colyseus/schema` decorators at build time.
 */

import type { AnimationName, CharacterClass } from './assets.js';
import type { LobbyMode, Team } from './constants.js';
import type { StatusKind } from './abilities/effects.js';
import type { CosmeticsState } from './cosmetics.js';

/** Replicated active status effect. Mirrors `StatusEffect` in the server schema. */
export interface StatusView {
  /** What the status does (crowd control / buff / debuff / dot-hot / shield). */
  kind: StatusKind;
  /** Sim-time (ms) the status ends — the client can render a countdown. */
  expiresAt: number;
  /** Stat scalar (slow/haste/attack_speed/damage_amp) or shield absorb; 0 if unused. */
  magnitude: number;
  /** Sim-time (ms) of the next dot/hot tick; 0 for non-ticking statuses. */
  nextTickAt: number;
  /** Session id of the player who applied it ('' if environmental). */
  sourceId: string;
}

/** Replicated per-player state. Mirrors `Player` in the server schema. */
export interface PlayerView {
  readonly sessionId: string;
  name: string;
  /** World position. */
  x: number;
  y: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  /** Remaining absorb shield (drained before HP). Drives the shield bubble VFX. */
  shield: number;
  alive: boolean;
  /** Playable class — drives which character asset the client renders. */
  characterClass: CharacterClass;
  /** Optional skin asset id applied on top of the class's base appearance. */
  skinId: string;
  /** Equipped dye cosmetic id ('' = none) — tints the body. */
  dyeId: string;
  /** Equipped pedestal cosmetic id ('' = none) — colors the portrait pedestal. */
  pedestalId: string;
  /** Equipped title cosmetic id ('' = none) — shown on the nameplate. */
  titleId: string;
  /** Authoritative animation state; remote clients render this directly. */
  animState: AnimationName;
  /** Side this player fights for in a team match ('blue' in town / FFA). */
  team: Team;
  /** Session id this player is auto-attacking, or '' — drives the attack banner. */
  attackTargetId: string;
  /** Persisted class progression for this character (defaults for a new player). */
  level: number;
  xp: number;
  kills: number;
  deaths: number;
  /** Active status effects (CC / buffs / debuffs). Drives over-head indicators. */
  statuses: StatusView[];
  /** Ability id of an in-progress channel ('' if none) + its aim direction —
   *  drives the beam VFX (e.g. the priest's Judgment ray). */
  channelAbility: string;
  channelDirX: number;
  channelDirZ: number;
  /** Pickable object the player is carrying over their head ('' if none) — drives
   *  the held-object render. A {@link PickableKind} by construction. */
  holding: string;
}

/** Replicated burning barrel. Mirrors `Barrel` in the server schema. An exploded
 *  barrel is removed from the collection (so `alive` is effectively always true
 *  for a present barrel, but kept for clarity / a one-frame death pose). */
export interface BarrelView {
  readonly id: string;
  x: number;
  y: number;
  z: number;
  /** Orientation quaternion (identity while resting; tumbles while launched). */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  alive: boolean;
}

/**
 * Replicated destructible environment object (tire / barrel / building part).
 * Mirrors `DestructibleObject` in the server schema. The size fields (`sx/sy/sz`)
 * are written once at spawn and interpreted per `kind`; the transform fields are
 * driven by the server's lightweight rigid-body sim while the body is `active`.
 */
export interface DestructibleView {
  readonly id: string;
  /** Fine-grained kind (see `DestructibleKind`) — drives the client visual. */
  kind: string;
  /** Structure id this piece belongs to ('' for standalone tires/barrels). */
  group: string;
  x: number;
  y: number;
  z: number;
  /** Orientation quaternion. */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Static size, interpreted per kind: tire (radius, tube, _),
   *  barrel (radius, halfHeight, _), building part (halfX, halfY, halfZ). */
  sx: number;
  sy: number;
  sz: number;
  /** Hit points (drums only; tires stay 0). Drives the floating integrity bar. */
  hp: number;
  maxHp: number;
  /** True while the body is awake/moving (asleep bodies hold their transform). */
  active: boolean;
}

/**
 * Replicated destructible cover structure (trailer="house" / car / dumpster).
 * Mirrors `CoverStructure` in the server schema. Blocks movement + projectiles
 * while alive; when its HP hits 0 it `destroyed` → crumbles and stops colliding.
 */
export interface CoverStructureView {
  readonly id: string;
  /** Prop asset to render (e.g. 'prop.arena.trailer'). */
  assetId: string;
  x: number;
  z: number;
  /** Yaw (radians). */
  rotation: number;
  /** Collision footprint radius + visual height. */
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  /** True once crumbled — uncollidable, rendered as flattened rubble. */
  destroyed: boolean;
}

/**
 * Replicated pickable object sitting on the ground (molotov / grenade), waiting to
 * be grabbed. Mirrors `Pickable` in the server schema.
 */
export interface PickableView {
  readonly id: string;
  /** Which pickable this is — drives the client visual. A {@link PickableKind}. */
  kind: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Replicated lingering ground effect — currently the molotov's burning puddle.
 * Mirrors `GroundZone` in the server schema. The server owns the periodic damage;
 * the client just renders a circle sized to `radius` (the damage area).
 */
export interface GroundZoneView {
  readonly id: string;
  /** Effect kind (e.g. 'molotov_fire') — drives the client visual. */
  kind: string;
  x: number;
  z: number;
  /** Effect radius (world units) — the VFX matches this exactly. */
  radius: number;
}

/** Replicated in-flight projectile. Mirrors `Projectile` in the server schema. */
export interface ProjectileView {
  readonly id: string;
  ownerId: string;
  /** Ability that spawned it (e.g. 'fireball'). */
  ability: string;
  x: number;
  y: number;
  z: number;
}

/**
 * A player's persisted progression on one class. Returned by the auth endpoints
 * so the character-select screen can show the level reached per class.
 */
export interface ClassProgressView {
  characterClass: CharacterClass;
  level: number;
  xp: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
}

/** Authentication response: a session token plus the account's per-class progress. */
export interface AuthResult {
  token: string;
  username: string;
  progress: ClassProgressView[];
  /** Per-class cosmetics: each character's owned ids + equipped loadout. */
  cosmetics: CosmeticsState;
  /** True when this is a guest session (temporary identity, not yet registered). */
  guest?: boolean;
}

/**
 * Per-account camera preference locks, synced to the server. When a lock is on,
 * that manual camera control is disabled and the view is snapped back to its
 * neutral for that axis.
 */
export interface CameraPrefs {
  /** Disallow tilting the view up (toward top-down). */
  lockTiltUp: boolean;
  /** Disallow tilting the view down (flatter / more horizontal). */
  lockTiltDown: boolean;
  /** Disallow left/right orbiting — yaw stays at the per-team default. */
  lockRotation: boolean;
  /** Disallow zoom — the camera stays at its default distance. */
  lockZoom: boolean;
}

/** All locks off — the default for a fresh account / when persistence is off. */
export const DEFAULT_CAMERA_PREFS: CameraPrefs = {
  lockTiltUp: false,
  lockTiltDown: false,
  lockRotation: false,
  lockZoom: false,
};

/** A lobby's lifecycle stage, replicated to drive the matchmaking UI. */
export type LobbyStatus = 'queuing' | 'ready_check' | 'playing';

/** One team slot in a lobby. `sessionId === ''` means the slot is open. */
export interface LobbySlotView {
  /** Matchmaking-room session id of the occupant, or '' if empty. */
  sessionId: string;
  name: string;
  characterClass: CharacterClass;
  team: Team;
  /** Position within the team column (0-based). */
  index: number;
  /** Whether the occupant has accepted the ready-check. */
  accepted: boolean;
}

/** A lobby as seen by the matchmaking browser / detail / ready-check UI. */
export interface LobbyView {
  id: string;
  name: string;
  mode: LobbyMode;
  status: LobbyStatus;
  /** Matchmaking-room session id of the host (slot owner who created it). */
  hostId: string;
  /** Sim-time (ms) the ready-check expires at; 0 when not in ready_check. */
  readyDeadline: number;
  blue: LobbySlotView[];
  red: LobbySlotView[];
}

/** Replicated room state. Mirrors `ArenaState` in the server schema. */
export interface ArenaStateView {
  /** Keyed by Colyseus session id. */
  players: Map<string, PlayerView>;
  /** Keyed by projectile id. */
  projectiles: Map<string, ProjectileView>;
  /** Keyed by barrel id. */
  barrels: Map<string, BarrelView>;
  /** Keyed by destructible id (tires / barrels / building parts). */
  destructibles: Map<string, DestructibleView>;
  /** Keyed by cover-structure id (trailers / cars / dumpsters with HP). */
  structures: Map<string, CoverStructureView>;
  /** Keyed by pickable id (molotovs / grenades waiting to be grabbed). */
  pickables: Map<string, PickableView>;
  /** Keyed by ground-zone id (lingering effects like the molotov puddle). */
  groundZones: Map<string, GroundZoneView>;
  /** Monotonically increasing server tick counter. */
  tick: number;
  /** Per-match seed for the procedural arena layout (see `generateArenaLayout`). */
  layoutSeed: number;
  /** Zombie survival mode is active (drives the wave HUD). False in every other room. */
  zombieMode: boolean;
  /** Current zombie wave/level (1-based; 0 before the first horde starts). */
  zombieLevel: number;
  /** Zombies left to defeat this level (alive + not-yet-spawned). 0 between levels. */
  zombiesRemaining: number;
  /** Zombies currently alive in the arena (for the HUD's live count). */
  zombiesAlive: number;
}
