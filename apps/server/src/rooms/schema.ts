import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
import { PLAYER_MAX_HP, PLAYER_MAX_MANA, type StatusKind } from '@arena/shared';

/**
 * One active status effect on a player (crowd control / buff / debuff / dot-hot
 * / shield-lifetime). Replicated so every client can render over-head
 * indicators without a bespoke message. Mirrors `StatusView` in `@arena/shared`.
 */
export class StatusEffect extends Schema {
  /** Stored as a string for replication; it's a `StatusKind` by construction. */
  @type('string') kind: StatusKind = 'stun';
  /** Sim-time (ms) the status ends. The server prunes it past this. */
  @type('number') expiresAt = 0;
  /** Stat scalar (slow/haste/attack_speed/damage_amp) or shield absorb; 0 if unused. */
  @type('number') magnitude = 0;
  /** Sim-time (ms) of the next dot/hot tick; 0 for non-ticking statuses. */
  @type('number') nextTickAt = 0;
  /** HP changed per tick for dot/hot. */
  @type('number') tickAmount = 0;
  /** Tick interval (ms) for dot/hot/field. */
  @type('number') tickMs = 0;
  /** Session id of the applier ('' if environmental). */
  @type('string') sourceId = '';
  /** For `empower`: the ability id the bonus is restricted to ('' = any hit). */
  @type('string') ability = '';
}

/**
 * Authoritative per-player state. Field order and types must stay in sync with
 * `PlayerView` in `@arena/shared` so the client can read replicated state safely.
 */
export class Player extends Schema {
  @type('string') sessionId = '';
  @type('string') name = 'Adventurer';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') rotation = 0;
  @type('number') hp = PLAYER_MAX_HP;
  @type('number') maxHp = PLAYER_MAX_HP;
  @type('number') mana = PLAYER_MAX_MANA;
  @type('number') maxMana = PLAYER_MAX_MANA;
  /** Remaining absorb shield (drained before HP). Mirrors `PlayerView.shield`. */
  @type('number') shield = 0;
  @type('boolean') alive = true;
  /** Active status effects (CC / buffs / debuffs / dot-hot). */
  @type([StatusEffect]) statuses = new ArraySchema<StatusEffect>();
  /** Playable class id; the client maps this to a character asset. */
  @type('string') characterClass = 'warrior';
  /** Optional skin asset id layered on top of the class appearance. */
  @type('string') skinId = '';
  /** Equipped dye cosmetic id ('' = none) — tints the body. */
  @type('string') dyeId = '';
  /** Equipped pedestal cosmetic id ('' = none) — colors the portrait pedestal. */
  @type('string') pedestalId = '';
  /** Equipped title cosmetic id ('' = none) — shown on the nameplate. */
  @type('string') titleId = '';
  /** Account id (0 = guest/none). Lets peers fetch this player's custom paint via
   *  the public /paint/:pid route — the PNG is too large for the schema itself. */
  @type('number') pid = 0;
  /** Revision of this player's custom paint for their class ('' = none). When it
   *  changes, peers refetch the paint PNG over HTTP. */
  @type('string') paintRev = '';
  /**
   * Authoritative animation state (idle/run/attack/cast/hit/die). Remote clients
   * play this directly; the local client predicts its own for responsiveness.
   */
  @type('string') animState = 'idle';
  /** Session id this player is auto-attacking ('' if none). Replicated so every
   *  client can show an "is attacking you/<name>" banner over the target. */
  @type('string') attackTargetId = '';
  /** Persisted class progression (loaded on join; updated live on kills). */
  @type('number') level = 1;
  @type('number') xp = 0;
  @type('number') kills = 0;
  @type('number') deaths = 0;
  /** Team side in a team match ('blue' in town and for unassigned joins). Kept
   *  last so existing replicated field offsets are unchanged. */
  @type('string') team = 'blue';
  /** Ability id of an in-progress channel (e.g. the priest beam), '' if none —
   *  drives the client beam VFX. */
  @type('string') channelAbility = '';
  /** Current aim direction of the active channel (normalized). */
  @type('number') channelDirX = 0;
  @type('number') channelDirZ = 1;
  /** Pickable object kind being carried over the head ('' if none). Mirrors
   *  `PlayerView.holding`; a `PickableKind` by construction. Kept last so existing
   *  replicated field offsets are unchanged. */
  @type('string') holding = '';
  /** Equipped avatar-rim cosmetic id — the 2D frame drawn around this player's
   *  portrait/avatar in UI. Defaults to the standard frame. Kept last so existing
   *  replicated field offsets are unchanged. */
  @type('string') rimId = 'rim.standard';
  /** Gun Mode Zombie: equipped gun id ('' outside gun mode). Mirrors
   *  `PlayerView.equippedGun`; a `GunKind` by construction. Kept last so existing
   *  replicated field offsets are unchanged. */
  @type('string') equippedGun = '';
  /** Rounds left in the equipped gun's magazine. */
  @type('number') magAmmo = 0;
  /** Spare rounds in reserve; -1 (`GUN_RESERVE_INFINITE`) = unlimited. */
  @type('number') reserveAmmo = 0;
  /** True while reloading the equipped gun (can't fire until it completes). */
  @type('boolean') reloading = false;
  /** Zombie perk slot 1 (a `PerkId` or '' if empty). */
  @type('string') perk1 = '';
  /** Zombie perk slot 2 (a `PerkId` or '' if empty). */
  @type('string') perk2 = '';
  /** Zombie perk slot 3 (a `PerkId` or '' if empty). */
  @type('string') perk3 = '';
}

/** Authoritative in-flight projectile, mirrors `ProjectileView` in `@arena/shared`. */
export class Projectile extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') ability = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
}

/** Authoritative arena room state, mirrors `ArenaStateView` in `@arena/shared`. */
/** A destructible burning barrel: idle until hit, then launched (server-driven
 *  arc, replicated x/y/z), then removed on explosion. */
export class Barrel extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  /** Orientation quaternion — driven by the physics body while it's launched, so
   *  the toss tumbles on clients (identity while resting). */
  @type('number') qx = 0;
  @type('number') qy = 0;
  @type('number') qz = 0;
  @type('number') qw = 1;
  @type('boolean') alive = true;
}

/**
 * A destructible environment object (tire / barrel / building part), mirrors
 * `DestructibleView` in `@arena/shared`. The server runs a lightweight
 * rigid-body sim over these and replicates the transform; the non-replicated
 * velocity/sleep state lives in the {@link DestructibleSystem}. These do NOT
 * explode — they only react physically when hit. Size (`sx/sy/sz`) is written
 * once at spawn and interpreted per `kind`. */
export class DestructibleObject extends Schema {
  @type('string') id = '';
  /** Fine-grained kind (see `DestructibleKind`): tire/barrel/wall/roof/… */
  @type('string') kind = 'barrel';
  /** Structure id for building pieces ('' for standalone tires/barrels). */
  @type('string') group = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  /** Orientation quaternion (identity at rest). */
  @type('number') qx = 0;
  @type('number') qy = 0;
  @type('number') qz = 0;
  @type('number') qw = 1;
  /** Static size, interpreted per kind (see schema/view doc). */
  @type('number') sx = 0.5;
  @type('number') sy = 0.5;
  @type('number') sz = 0.5;
  /** Hit points (drums only; tires stay 0). Drives the floating integrity bar. */
  @type('number') hp = 0;
  @type('number') maxHp = 0;
  /** True while awake/moving — clients can smooth harder while active. */
  @type('boolean') active = false;
}

/**
 * A destructible cover structure (trailer="house" / car / dumpster), mirrors
 * `CoverStructureView` in `@arena/shared`. Has HP; blocks movement + projectiles
 * while alive; when `destroyed` it crumbles and stops colliding. */
export class CoverStructure extends Schema {
  @type('string') id = '';
  /** Prop asset id the client renders (e.g. 'prop.arena.trailer'). */
  @type('string') assetId = '';
  @type('number') x = 0;
  @type('number') z = 0;
  /** Yaw (radians). */
  @type('number') rotation = 0;
  @type('number') radius = 1;
  @type('number') height = 1;
  @type('number') hp = 100;
  @type('number') maxHp = 100;
  @type('boolean') destroyed = false;
  /** Visual length (X-axis) stretch — 1 is the base model. Trailers vary so the
   *  park reads as different-length rectangles (width is never changed). */
  @type('number') lengthScale = 1;
}

/** A pickable object resting on the ground (molotov / grenade), waiting to be
 *  grabbed. Mirrors `PickableView` in `@arena/shared`. */
export class Pickable extends Schema {
  @type('string') id = '';
  /** Which pickable this is (a `PickableKind`). */
  @type('string') kind = 'grenade';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') scale = 1;
}

/** A lingering ground effect — the molotov's burning puddle. Mirrors
 *  `GroundZoneView` in `@arena/shared`. The server owns the periodic damage; the
 *  client renders a circle sized to `radius`. */
export class GroundZone extends Schema {
  @type('string') id = '';
  /** Effect kind (e.g. 'molotov_fire') — drives the client visual. */
  @type('string') kind = 'molotov_fire';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') radius = 1;
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Barrel }) barrels = new MapSchema<Barrel>();
  @type({ map: DestructibleObject }) destructibles = new MapSchema<DestructibleObject>();
  @type({ map: CoverStructure }) structures = new MapSchema<CoverStructure>();
  @type({ map: Pickable }) pickables = new MapSchema<Pickable>();
  @type({ map: GroundZone }) groundZones = new MapSchema<GroundZone>();
  @type('number') tick = 0;
  /** Per-match seed for the procedural arena layout. Clients rebuild the same
   *  obstacles + props from it (see `generateArenaLayout`). 0 until onCreate. */
  @type('number') layoutSeed = 0;
  /** Zombie survival mode is active — drives the client's wave HUD. */
  @type('boolean') zombieMode = false;
  /** Gun Mode Zombie is active — zombie survival fought with guns (WASD + mouse
   *  aim + right-click) instead of the ability kit. Implies `zombieMode`. */
  @type('boolean') gunMode = false;
  /** Co-op matchmade zombie run (death is final; drives the client's co-op
   *  death/spectate flow). False for the drop-in zombie room. */
  @type('boolean') coopZombie = false;
  /** Current zombie wave/level (1-based; 0 before the first horde). */
  @type('number') zombieLevel = 0;
  /** Zombies left to defeat this level (alive + not-yet-spawned); 0 between levels. */
  @type('number') zombiesRemaining = 0;
  /** Zombies currently alive in the arena. */
  @type('number') zombiesAlive = 0;
  /** How many sections beyond the main room are unlocked (0–3). Drives the
   *  client's section rendering, minimap, and door barrier state. */
  @type('number') unlockedSections = 0;
}
