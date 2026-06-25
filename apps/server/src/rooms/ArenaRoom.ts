import { type Client } from '@colyseus/core';
import type { ZOMBIE_MODE } from '@arena/shared';
import {
  ARENA_HALF_SIZE,
  ARENA_HALF_Z,
  ARENA_POND,
  arenaSpawnsForTeam,
  generateArenaLayout,
  generateSectionCover,
  generateRoomLayout,
  trapForSection,
  clampToUnlockedArea,
  collideObstacles,
  type ArenaObstacle,
  type RoomLayout,
  isLobbyMode,
  isTeam,
  teamSizeForMode,
  AUTO_ATTACKS,
  GROUND_Y,
  gunMoveSpeedMult,
  type GunView,
  MANA_REGEN,
  MATCH_RESULT_LINGER_MS,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  ZOMBIE_COOP_MAX_PLAYERS,
  TICK_MS,
  ZOMBIE_ATTACK_MAX_MS,
  ZOMBIE_ATTACK_MIN_MS,
  ZOMBIE_ATTACK_WINDUP_MS,
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_MINIBOSS_SKIN_ID,
  ZOMBIE_STUCK_MOVE_EPS,
  ZOMBIE_STUCK_TICKS,
  ZOMBIE_DETOUR_MS,
  ZOMBIE_DETOUR_RAD,
  ZOMBIE_WANDER_FALLOFF,
  ZOMBIE_WANDER_MAX_RAD,
  zombieSpeedForLevel,
  ClientMessage,
  type ClientMessagePayloads,
  ServerMessage,
  isAbilityKind,
  isRooted,
  isSilenced,
  isStunned,
  isBlinded,
  attackSpeedMultiplier,
  moveSpeedMultiplier,
  CHARACTER_CLASSES,
  isCharacterClass,
  type AbilityDef,
  type AbilityKind,
  type BotDifficulty,
  type CharacterClass,
  type LobbyMode,
} from '@arena/shared';
import { ArenaState, Player } from './schema.js';
import { AvatarRoom } from './AvatarRoom.js';
import { regenMana, reviveFull, spendMana } from '../combat.js';
import { INSTANT_ONESHOT_MS } from '../animation.js';
import { ChatLog } from '../chat.js';
import { getPool } from '../db/database.js';
import {
  resolveClass,
  resolveDyeId,
  resolveName,
  resolvePaintRev,
  resolvePedestalId,
  resolveRimId,
  resolveSkinId,
  resolveTitleId,
  resolveWeaponId,
  resolveEnchantId,
  type JoinOptions,
} from './util/identity.js';
import { applyGravity, clamp, stepMove } from './util/locomotion.js';
import { ArenaTuning } from './arena/systems/tuning.js';
import { ArenaMatch } from './arena/systems/match.js';
import { CombatSystem } from './arena/systems/combat.js';
import { ProjectileSystem } from './arena/systems/projectiles.js';
import { GunSystem } from './arena/systems/guns.js';
import { BarrelSystem, BARREL_RADIUS } from './arena/systems/barrels.js';
import { DestructibleSystem } from './arena/systems/destructibles.js';
import { GroundZoneSystem } from './arena/systems/groundZones.js';
import { PickableSystem } from './arena/systems/pickables.js';
import { TrapSystem } from './arena/systems/traps.js';
import { resolveGameMode, deathPolicy, type GameMode } from './arena/modes.js';
import { inBeam } from './arena/combatMath.js';
import { registerGunHandlers } from './arena/gunHandlers.js';
import { registerDevHandlers } from './arena/devHandlers.js';
import { ArenaPhysics } from './arena/systems/physics.js';
import { CoverSystem } from './arena/systems/cover.js';
import { BotDirector, makeBotProfile, type BotProfile } from './arena/systems/bots.js';
import { ZombieDirector } from './arena/systems/zombies.js';
import { ZombieSurvival } from './arena/systems/zombieSurvival.js';
import { PerkSystem, IDENTITY_MODIFIERS, getPerkMoveSpeedMult } from './arena/systems/perks.js';
import { fetchProfile, persistProfileDelta, type MatchProfile } from './arena/systems/profiles.js';
import type { ArenaContext, Displacement } from './arena/context.js';
import { captureServerError, captureTickError, userFromClaims } from '../observability.js';
import { verifyToken, type TokenClaims } from '../auth.js';
import { ensureGuestAccount } from '../db/players.js';

/** Upper bound on practice bots a room will host at once. */
const MAX_BOTS = 8;
/** Display names cycled through as bots spawn. */
const BOT_NAMES = [
  'Bot Kratos',
  'Bot Vex',
  'Bot Nyx',
  'Bot Rook',
  'Bot Onyx',
  'Bot Saber',
  'Bot Wraith',
  'Bot Zane',
];

/** Origin height for a cast's broadcast (matches the projectile spawn height). */
const PROJECTILE_Y = 1;

/** Contact radius for a damaging dash (Charge) colliding with props — sized so a
 *  fast slide doesn't tunnel between ticks before it bumps a barrel/drum/tire. */
const DASH_IMPACT_RADIUS = 1.2;
/** Radius (world units) of the Colossus damaging aura — a melee-range ring. */
const AURA_RADIUS = 3.5;

/** Cooldown leniency (ms) on casts: a client whose optimistic cooldown just
 *  expired shouldn't have its cast rejected by round-trip / tick jitter (which
 *  wastes the press and desyncs the cooldown display). Absorbs typical latency. */
const CAST_COOLDOWN_GRACE_MS = 400;

/** A cast in its wind-up: the effect resolves at `resolveAt` (sim time, ms). */
interface PendingCast {
  ability: AbilityKind;
  config: AbilityDef;
  dirX: number;
  dirZ: number;
  /** Ground-target impact point (ground-targeted abilities only). */
  targetX?: number;
  targetZ?: number;
  /** Locked target's session id (unit-targeted abilities only). */
  unitTargetId?: string;
  resolveAt: number;
}

/** Per-zombie movement personality + stuck-detection state. The personality
 *  (speed/wander/attack) spreads the horde out; the stuck fields drive a
 *  perpendicular reroute when a zombie wedges on cover instead of pathfinding. */
/**
 * Authoritative arena simulation. Clients send point-and-click move targets,
 * jump and ability-cast requests; the room validates and integrates everything
 * on a fixed timestep and replicates the result via schema sync. Movement, jump,
 * chat and emote handling come from {@link AvatarRoom}; this class owns the
 * combat tick loop and wires together the balance ({@link ArenaTuning}),
 * combat ({@link CombatSystem}), projectile ({@link ProjectileSystem}) and ranked
 * ({@link ArenaMatch}) systems via a shared {@link ArenaContext}. All gameplay is
 * server-owned.
 */
export class ArenaRoom extends AvatarRoom {
  override maxClients = MAX_PLAYERS;

  protected override readonly chat = new ChatLog();
  protected override halfLimit = ARENA_HALF_SIZE - PLAYER_RADIUS;

  /** The arena's half-extent (X) for this match — `ARENA_HALF_SIZE` for normal
   *  arenas, `ZOMBIE_ROOM_HALF_SIZE` when the room expansion system is active.
   *  Every bounds clamp in the file reads this instead of the constant directly. */
  private arenaLimit = ARENA_HALF_SIZE;

  /** The arena's half-extent along Z. FFA is a rectangle (longer N/S), so this is
   *  larger than `arenaLimit`; zombie mode keeps it square (= `arenaLimit`). */
  private arenaLimitZ = ARENA_HALF_SIZE;

  /** Room expansion system (zombie mode only): the generated section/door layout
   *  for this match. `null` in non-zombie arenas. */
  private roomLayout: RoomLayout | null = null;

  // Arena-specific per-session state (the avatar maps live on AvatarRoom).
  private readonly cooldowns = new Map<string, Partial<Record<AbilityKind, number>>>();
  private readonly respawnAt = new Map<string, number>();
  /** Sim time (ms) each player's Colossus damaging aura next ticks. */
  private readonly auraNextAt = new Map<string, number>();
  /** Casts mid wind-up (castTimeMs > 0); the player is rooted until they resolve. */
  private readonly pendingCasts = new Map<string, PendingCast>();
  /** Current auto-attack target (a player session id) per attacker. */
  private readonly attackTargets = new Map<string, string>();
  /** Sim time (ms) each player's next auto-attack is ready. */
  private readonly attackReadyAt = new Map<string, number>();
  /** Sim time (ms) each player's next kick is ready. */
  private readonly kickReadyAt = new Map<string, number>();
  /** Ninja E double-dash recast state: session ID -> state metadata */
  private readonly ninjaEStates = new Map<
    string,
    {
      stage: number;
      windowStart: number;
      windowEnd: number;
      perkMods: { manaCostMult: number; cooldownMult: number };
      firstCastTime: number;
    }
  >();
  /** Forced motion (dash / knockback) that overrides locomotion until `until`. */
  private readonly displacements = new Map<string, Displacement>();
  /** In-progress channels (e.g. the priest beam): the ability, when it ends, the
   *  next object-damage tick, and a per-enemy "next DoT" clock (an enemy gets 12
   *  the instant it enters the beam, then every `channelTickMs`; leaving resets
   *  it). Aim direction lives on the replicated `Player.channelDir*`. */
  private readonly channels = new Map<
    string,
    { config: AbilityDef; endAt: number; objTickAt: number; engaged: Map<string, number> }
  >();
  /** Persisted-profile accumulators per session (kills/deaths/xp this match). */
  private readonly profiles = new Map<string, MatchProfile>();
  /** AI-controlled bots in this room (practice bots, or zombies in zombie mode),
   *  by synthetic session id. */
  private readonly bots = new Map<string, BotProfile>();
  /** Monotonic counter for synthetic bot session ids. */
  private botSeq = 0;
  /** Auto-attack feature flag (off by default — abilities-only combat). Toggled
   *  at runtime via {@link ClientMessage.SetAutoAttack}; forced on in zombie mode
   *  so zombies chase + strike (players still attack with abilities only). */
  private autoAttackEnabled = false;
  /** This room's game mode (FFA / ranked / zombie / gun-zombie / coop) — the
   *  SINGLE source of truth for per-mode config + behaviour. Set in `onCreate`. */
  private mode!: GameMode;
  /** Endless-horde survival (zombies, room expansion, forced auto-attack). */
  private get zombieMode(): boolean {
    return this.mode.zombie;
  }
  /** Gun Mode Zombie: survival fought with guns instead of the ability kit. */
  private get gunMode(): boolean {
    return this.mode.gun;
  }
  /** Co-op squad run: death is final and the run ends when the whole squad falls. */
  private get coopZombie(): boolean {
    return !this.mode.respawns;
  }
  /** Per-player active Gun Mode view ('fps' | 'topdown'), reported by the client.
   *  Drives the per-view move speed so movement matches the client predictor. */
  private readonly gunViews = new Map<string, GunView>();
  /** Latches once the co-op run is over (all players fell) so the game-over
   *  broadcast + room teardown fire exactly once. */
  private coopOver = false;
  /** The wave director (zombie mode only) — owns the level/horde lifecycle. */
  private zombieDirector?: ZombieDirector;
  /** Slain zombies awaiting corpse removal: session id → sim time (ms) to remove
   *  it at (a brief linger so the death pose plays before it vanishes). */
  private readonly zombieCorpseAt = new Map<string, number>();
  /** Mode-specific zombie-survival logic (per-zombie AI + spawn portals; more to
   *  follow). Built only in zombie mode; undefined otherwise. */
  private zombie?: ZombieSurvival;
  /** Next allowed timestamp (sim ms) for a Mini-Boss special action. */
  private readonly bossNextActionAt = new Map<string, number>();
  /** Chest spawn timer (ms). Starts at 1.5 minutes (90000 ms), then resets to 1.5 minutes (90000 ms). */
  private chestSpawnTimer = 90000;

  /** This match's live collision set for movement and projectiles: a circle for
   *  every alive destructible structure (trailers, cars, dumpsters, scrap heaps).
   *  Mutated by the cover system — a crumbled structure's circle is removed so it
   *  stops blocking. */
  private obstacles: ArenaObstacle[] = [];

  /** Per-tick scratch obstacle lists, reused across ticks (cleared + re-pushed)
   *  to avoid ~720 array allocations/sec at the zombie cap. Built once in
   *  `update()` and shared by every consumer that tick. */
  private readonly zombieBlockers: ArenaObstacle[] = [];
  private readonly propObstacles: ArenaObstacle[] = [];
  /** `obstacles` + live props — what zombies slide against while chasing and get
   *  re-resolved against post-collision. Stable across a tick (props move only in
   *  the later physics step). */
  private readonly zombieStaticObstacles: ArenaObstacle[] = [];

  /** Live-tunable balance for this room (per-room copy of the shared canon). */
  private readonly tuning = new ArenaTuning();
  // Combat systems, wired up in `onCreate` once the state + context exist.
  private match!: ArenaMatch;
  private combat!: CombatSystem;
  private projectiles!: ProjectileSystem;
  /** Gun Mode Zombie weapons (magazine / fire-rate / reload / switch). Built in
   *  every arena but only driven when {@link gunMode} is on. */
  /** Gun system — built only when `mode.usesGuns` (gun-mode zombie); undefined
   *  otherwise. All access is optional-chained. */
  private guns?: GunSystem;
  private barrels!: BarrelSystem;
  private destructibles!: DestructibleSystem;
  /** HP-bearing cover structures (trailers/cars/dumpsters) that crumble. */
  private cover!: CoverSystem;
  /** Lingering ground effects (the molotov's burning puddle). */
  private groundZones!: GroundZoneSystem;
  /** Pickable objects (molotov / grenade): grab/carry/throw + drum drops. */
  private pickables!: PickableSystem;
  /** Trap zones (zombie mode only): charge off zombie deaths, fire heal/fire. */
  private traps!: TrapSystem;
  /** Shared Rapier world for the destructible props + launched barrels. */
  private physics!: ArenaPhysics;
  private botDirector!: BotDirector;
  /** Zombie perk progression (ability-mode zombie only). */
  private perkSystem?: PerkSystem;

  protected override jumpForce(): number {
    return this.tuning.movement.jumpForce;
  }

  /** A manual move order cancels any auto-attack. */
  protected override onMoveOrder(sessionId: string): void {
    this.attackTargets.delete(sessionId);
  }

  override onCreate(options?: {
    mode?: LobbyMode | typeof ZOMBIE_MODE;
    coop?: boolean;
    gun?: boolean;
  }): void {
    this.setState(new ArenaState());

    // Resolve this room's game mode (FFA / ranked / zombie / gun-zombie / co-op)
    // from the options baked into its `define`. The mode object is the single
    // source of truth for per-mode config + behaviour; the `zombieMode`/`gunMode`/
    // `coopZombie` getters are thin derived views of it.
    this.mode = resolveGameMode(options);

    // Play-area bounds + forced auto-attack come straight from the mode.
    this.arenaLimit = this.mode.bounds.halfX;
    this.arenaLimitZ = this.mode.bounds.halfZ;
    this.halfLimit = this.mode.bounds.halfX - PLAYER_RADIUS;
    this.halfLimitZ = this.mode.bounds.halfZ - PLAYER_RADIUS;
    this.autoAttackEnabled = this.mode.autoAttack;

    // Pick a per-match seed and build this arena's procedural cover. The seed is
    // replicated so every client rebuilds the identical layout (obstacles +
    // props) — see `generateArenaLayout`. Done before `buildSystems` so the
    // combat/projectile context captures this match's obstacles.
    const seed = (1 + Math.floor(Math.random() * 0xfffffffe)) >>> 0;
    this.state.layoutSeed = seed;
    const layout = generateArenaLayout(seed, this.zombieMode);
    // A mutable copy: the cover system pushes alive structure circles in here and
    // splices them out when a structure crumbles (so it becomes uncollidable).
    this.obstacles = [...layout.obstacles];

    this.buildSystems();
    this.barrels.init(layout.barrels);
    this.destructibles.init(layout.drums, layout.tireStacks);
    this.cover.init(layout.structures);

    // A matchmade team game (1v1…5v5): cap at the mode's total size, scale the
    // win target by team size, and hide from public join (only reserved seats
    // get in). Without a mode this is the public free-for-all arena (portal).
    if (isLobbyMode(options?.mode)) {
      this.maxClients = 2 * teamSizeForMode(options.mode);
      this.setPrivate(true);
      this.match.configureRanked(options.mode);
    } else if (this.zombieMode) {
      // Co-op survival: players (blue) hold out against zombie hordes (red).
      // Auto-attack must be on for zombies to chase + strike; the Attack message
      // is ignored for humans (see the handler), so only zombies ever swing.
      this.state.zombieMode = true;
      this.state.gunMode = this.gunMode;

      // --- Room expansion system: generate the section/door layout. Doors are
      //     placed as indestructible walls that crumble when the matching wave is
      //     cleared. (Bounds + auto-attack are already set from the mode above.) ---
      this.roomLayout = generateRoomLayout(seed);
      // Mode-specific zombie logic. Handed references from inside the room (by
      // closure), so it touches none of the room's private internals directly.
      this.zombie = new ZombieSurvival({
        now: () => this.simTime,
        state: this.state,
        bots: this.bots,
        verticalVelocity: this.verticalVelocity,
        grounded: this.grounded,
        cooldowns: this.cooldowns,
        arenaLimit: this.arenaLimit,
        nextBotId: () => ++this.botSeq,
        resetPlayer: (player) => this.resetPlayer(player),
        roomLayout: () => this.roomLayout,
      });
      this.cover.setRoomLayout(this.roomLayout);
      this.destructibles.setRoomLayout(this.roomLayout);
      this.barrels.setRoomLayout(this.roomLayout);
      // Place door walls as indestructible cover at each door position.
      for (const door of this.roomLayout.doors) {
        this.cover.addDoor(door);
      }

      // Matchmade co-op run: cap the squad and hide from public join (reservation
      // only). Death is final + the run ends when all fall (see the tick loop).
      if (this.coopZombie) {
        this.state.coopZombie = true;
        this.maxClients = ZOMBIE_COOP_MAX_PLAYERS;
        this.setPrivate(true);
      }
      this.zombieDirector = new ZombieDirector(this.buildContext(), {
        spawnZombie: (level) => this.zombie!.spawnZombie(level),
        spawnMiniBoss: () => this.zombie!.spawnMiniBoss(),
        aliveZombies: () => this.zombie!.countAliveZombies(),
        humansPresent: () => this.zombie!.countHumans() > 0,
        onWaveClear: (level) => {
          // --- Room expansion: unlock the next door if this wave matches ---
          this.tryUnlockDoor(level);
          if (!this.perkSystem) return false;
          return this.perkSystem.onWaveClear(level);
        },
        perksResolved: () => {
          if (!this.perkSystem) return true;
          return !this.perkSystem.hasPendingOffers();
        },
        onWaveBegin: () => {
          this.perkSystem?.resetWaveCharges();
        },
      });
      this.zombieDirector.start(this.simTime);
    }

    // Perks exist in any ability-mode arena. Zombie waves offer them on wave
    // clear; the non-zombie FFA / team arena has no wave system, so they're
    // granted via dev tools for testing. (Gun mode has no ability kit.)
    if (this.mode.usesPerks) {
      this.perkSystem = new PerkSystem(this.buildContext());
    }

    // Movement / jump / chat / emote / set-name come from AvatarRoom.
    this.registerAvatarHandlers();

    this.onMessage<{ targetId: string }>(ClientMessage.Attack, (client, message) => {
      if (!this.autoAttackEnabled) return; // feature flag off — abilities-only combat
      if (!this.mode.manualAttack) return; // survival: fight the horde with abilities, not targeting
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive || isStunned(player) || isBlinded(player)) return;
      const targetId = String(message?.targetId ?? '');
      if (targetId === client.sessionId) return;
      // A valid target is a living enemy player, a live burning barrel, or a
      // standing (un-crumbled) cover structure.
      const target = this.state.players.get(targetId);
      const barrel = target ? undefined : this.barrels.liveBarrel(targetId);
      const structure = target || barrel ? undefined : this.cover.liveStructure(targetId);
      if ((!target || !target.alive) && !barrel && !structure) return;
      // Attack-move toward the target; clear any plain move destination.
      this.attackTargets.set(client.sessionId, targetId);
      this.destinations.delete(client.sessionId);
    });

    this.onMessage<ClientMessagePayloads[ClientMessage.CastAbility]>(
      ClientMessage.CastAbility,
      (client, message) => this.handleCast(client.sessionId, message),
    );

    // Spacebar: grab a nearby pickable (empty-handed) or throw the one being
    // carried, along the player's facing. A thrown object plays a quick toss pose.
    // Otherwise, falls back to a kick if no pickable is nearby.
    this.onMessage(ClientMessage.Interact, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const threw = !!player.holding;
      if (this.pickables.interact(player)) {
        if (threw) {
          this.animOneShots.set(client.sessionId, {
            name: 'attack',
            until: this.simTime + INSTANT_ONESHOT_MS,
          });
        }
      } else {
        const now = this.simTime;
        const nextReady = this.kickReadyAt.get(client.sessionId) ?? 0;
        if (now >= nextReady) {
          // Play the kick animation (reusing attack)
          this.animOneShots.set(client.sessionId, {
            name: 'attack',
            until: now + INSTANT_ONESHOT_MS,
          });
          // Apply 0.1s cooldown
          this.kickReadyAt.set(client.sessionId, now + 100);

          const dirX = Math.sin(player.rotation);
          const dirZ = Math.cos(player.rotation);
          const kickRangeEdge = 1.5; // Max edge-to-edge range
          const playerRadius = 0.5;
          const coneAngleCos = 0.5; // 120-degree cone total (±60 degrees)

          // Unified kick filter: returns distance if valid, or null
          const getKickDistance = (x: number, z: number, targetRadius: number): number | null => {
            const dx = x - player.x;
            const dz = z - player.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.01) return null;
            const dot = (dx * dirX + dz * dirZ) / d;
            if (dot < coneAngleCos) return null;
            const dist = d - playerRadius - targetRadius;
            if (dist <= kickRangeEdge) return dist;
            return null;
          };

          const c1 = this.destructibles.tryKick(getKickDistance, player.x, player.z, dirX, dirZ, player.sessionId);
          const c2 = this.barrels.tryKick(getKickDistance, dirX, dirZ, player.sessionId);
          const c3 = this.cover.tryKick(getKickDistance, dirX, dirZ);

          const candidates: { distance: number; perform: () => void }[] = [];
          if (c1) candidates.push(c1);
          if (c2) candidates.push(c2);
          if (c3) candidates.push(c3);

          if (candidates.length > 0) {
            candidates.sort((a, b) => a.distance - b.distance);
            candidates[0]?.perform();
          }
        }
      }
    });

    // Zombie perk pick: the player selects one of the 3 offered perk slots.
    this.onMessage<ClientMessagePayloads[ClientMessage.PerkPick]>(
      ClientMessage.PerkPick,
      (client, message) => {
        if (!this.perkSystem) return;
        const slot = Number(message?.slot);
        if (slot < 0 || slot > 3) return;
        this.perkSystem.handlePick(client.sessionId, slot, message?.upgradeTarget);
      },
    );

    // Dev-only tuning + debug handlers (live balance, bots, grant perks, add
    // levels). Given just the systems it needs + a bot-population callback.
    registerDevHandlers(this, {
      tuning: this.tuning,
      combat: this.combat,
      perkSystem: this.perkSystem,
      setBotPopulation: (message) => this.setBotPopulation(message),
    });

    this.onMessage(
      ClientMessage.SetAutoAttack,
      (_client, message: ClientMessagePayloads[ClientMessage.SetAutoAttack]) =>
        this.setAutoAttackEnabled(!!message?.enabled),
    );
    this.onMessage(
      ClientMessage.AimChannel,
      (client, message: ClientMessagePayloads[ClientMessage.AimChannel]) => {
        const player = this.state.players.get(client.sessionId);
        if (!player || !this.channels.has(client.sessionId)) return;
        const dx = Number(message?.dirX) || 0;
        const dz = Number(message?.dirZ) || 0;
        const len = Math.hypot(dx, dz);
        if (len < 1e-3) return;
        player.channelDirX = dx / len;
        player.channelDirZ = dz / len;
      },
    );

    // Charging a hold-to-aim ability (held, not yet released) — replicated so
    // other clients can play the wind-up. `ability: ''` clears it.
    this.onMessage(
      ClientMessage.SetCharge,
      (client, message: ClientMessagePayloads[ClientMessage.SetCharge]) => {
        const player = this.state.players.get(client.sessionId);
        if (!player || !player.alive) return;
        const ability = typeof message?.ability === 'string' ? message.ability : '';
        if (ability && isAbilityKind(ability) && !this.gunMode) {
          player.chargeAbility = ability;
          const dx = Number(message?.dirX) || 0;
          const dz = Number(message?.dirZ) || 0;
          if (Math.hypot(dx, dz) > 1e-3) {
            player.chargeDirX = dx;
            player.chargeDirZ = dz;
          }
        } else {
          player.chargeAbility = '';
        }
      },
    );

    // Catch-all: silently ignore unknown message types so a client that's newer
    // than the server (a deploy in progress) can't get DISCONNECTED for sending a
    // message this build doesn't handle yet. Specific handlers above take priority.
    this.onMessage('*', () => {});

    // Gun Mode Zombie weapon input (fire / switch / reload / aim). Registered
    // only in gun mode; the handlers are a no-op for dead players / CC'd casters.
    if (this.mode.usesGuns && this.guns) registerGunHandlers(this, this.guns, this.gunViews);

    // Swallow + capture a thrown tick instead of letting it bubble to
    // `uncaughtException` (which restarts the process and disconnects everyone).
    this.setSimulationInterval((deltaMs) => {
      try {
        this.update(deltaMs);
      } catch (err) {
        captureTickError(this.roomId, err, { where: 'arena.tick', roomId: this.roomId });
      }
    }, TICK_MS);
  }

  /** Build the {@link ArenaContext} seam — the shared world view (live maps by
   *  reference + broadcast/clock closures) every arena system reads through. */
  private buildContext(): ArenaContext {
    return {
      state: this.state,
      tuning: this.tuning,
      obstacles: this.obstacles,
      now: () => this.simTime,
      broadcast: (type, message) => this.broadcast(type, message),
      send: (sessionId, type, message) => {
        this.clients.getById(sessionId)?.send(type, message);
      },
      setTimeout: (handler, ms) => {
        this.clock.setTimeout(handler, ms);
      },
      disconnect: () => {
        void this.disconnect();
      },
      destinations: this.destinations,
      animOneShots: this.animOneShots,
      attackTargets: this.attackTargets,
      respawnAt: this.respawnAt,
      displacements: this.displacements,
      perkModifiers: (sessionId) =>
        this.perkSystem?.getModifiers(sessionId) ?? { ...IDENTITY_MODIFIERS },
      recordKill: (sessionId) => {
        if (this.perkSystem && this.perkSystem.recordKill(sessionId, this.simTime)) {
          const cd = this.cooldowns.get(sessionId);
          if (cd) {
            for (const key of Object.keys(cd)) {
              delete cd[key as AbilityKind];
            }
          }
          this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, {});
        }
      },
      resetCooldowns: (sessionId, abilityId) => {
        const cd = this.cooldowns.get(sessionId);
        if (cd) {
          if (abilityId) {
            delete cd[abilityId as AbilityKind];
          } else {
            for (const key of Object.keys(cd)) {
              delete cd[key as AbilityKind];
            }
          }
        }
        this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, { ability: abilityId });
      },
    };
  }

  /** Wire the combat / projectile / match systems over a shared context. Called
   *  once after `setState`, so the systems share the room's live maps. */
  private buildSystems(): void {
    const ctx = this.buildContext();
    this.match = new ArenaMatch(ctx);
    this.combat = new CombatSystem(ctx, this.match);
    this.projectiles = new ProjectileSystem(ctx, this.combat);
    if (this.mode.usesGuns) this.guns = new GunSystem(ctx, this.projectiles);
    this.physics = new ArenaPhysics(this.obstacles, this.zombieMode);
    this.barrels = new BarrelSystem(ctx, this.combat, this.physics);
    this.destructibles = new DestructibleSystem(ctx, this.combat, this.physics);
    this.cover = new CoverSystem(ctx, this.obstacles, this.combat, this.physics);
    this.groundZones = new GroundZoneSystem(ctx, this.combat);
    this.pickables = new PickableSystem(ctx, this.combat, this.projectiles, this.groundZones);
    this.traps = new TrapSystem(ctx, this.combat, this.groundZones);
    // A destroyed oil drum may drop a molotov (zombie mode only — see spawnFromDrum).
    this.destructibles.onDrumDestroyed((x, z) => this.pickables.spawnFromDrum(x, z));
    this.cover.onChestDestroyed((x, z) => {
      this.pickables.spawnGround('heal_pack', x, z, 4);
      this.chestSpawnTimer = 90000;
    });
    this.combat.attachProjectiles(this.projectiles);
    this.combat.attachBarrels(this.barrels);
    this.combat.attachDestructibles(this.destructibles);
    this.combat.attachCover(this.cover);
    this.botDirector = new BotDirector(ctx, {
      cooldowns: this.cooldowns,
      pendingCasts: this.pendingCasts,
      cast: (botId, message) => this.handleCast(botId, message),
    });
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    try {
      this.setupArenaJoin(client, options);
    } catch (err) {
      captureServerError(err, {
        message: '[arena] onJoin failed:',
        tags: { where: 'arena.onJoin', roomId: this.roomId, sessionId: client.sessionId },
        user: userFromClaims(verifyToken(options?.token)),
      });
      throw err; // re-throw so Colyseus rejects the seat (client sees a join error)
    }
  }

  private setupArenaJoin(client: Client, options?: JoinOptions): void {
    const claims = this.enforceSingleSession(client, options);

    const player = new Player();
    player.sessionId = client.sessionId;
    player.name = resolveName(claims, options);
    player.characterClass = resolveClass(options);
    player.skinId = resolveSkinId(options);
    player.dyeId = resolveDyeId(options);
    player.pedestalId = resolvePedestalId(options);
    player.titleId = resolveTitleId(options);
    player.rimId = resolveRimId(options);
    player.weaponId = resolveWeaponId(options, player.characterClass);
    player.enchantId = resolveEnchantId(options, player.characterClass);
    player.pid = claims?.pid ?? 0;
    player.paintRev = resolvePaintRev(options);
    // Team comes from the matchmaking seat reservation; public arena joins
    // (portal) carry none and default to blue.
    player.team = isTeam(options?.team) ? options.team : 'blue';
    this.resetPlayer(player);

    this.state.players.set(client.sessionId, player);
    this.verticalVelocity.set(client.sessionId, 0);
    this.grounded.set(client.sessionId, true);
    this.cooldowns.set(client.sessionId, {});
    // Init perk tracking for this player (zombie ability mode only).
    this.perkSystem?.init(client.sessionId);

    this.sendWelcome(client);

    // Load persisted progression for this account + class (async; sets the
    // replicated `level` and starts a stats accumulator). No-op without a valid
    // token or a database. Guests get their account row created here — the arena
    // is their "first match" — and bound for single-session enforcement.
    void this.loadProfile(client, claims, options, player.characterClass);
  }

  /** Load this account's class progression (identity comes from the token).
   *  For a guest, lazily create their `players` row (this is their first match)
   *  and bind the session, then load progress exactly like a registered account. */
  private async loadProfile(
    client: Client,
    claims: TokenClaims | null,
    options: JoinOptions | undefined,
    characterClass: string,
  ): Promise<void> {
    const db = getPool();
    if (!db || !claims) return;
    const sessionId = client.sessionId;
    let playerId = claims.pid;
    if (playerId === undefined && claims.guest && claims.gid) {
      playerId = await ensureGuestAccount(db, claims.gid, claims.name);
      // The guest now has an account id — enforce single-session like any account
      // (skipped at join time because there was no id yet).
      this.bindAccountSession(client, playerId, options);
    }
    if (playerId === undefined) return;
    try {
      const { profile, progress } = await fetchProfile(db, playerId, characterClass);
      this.profiles.set(sessionId, profile);
      // Seed the replicated career totals so the HUD shows persisted progress.
      const player = this.state.players.get(sessionId);
      if (player) {
        player.level = progress.level;
        player.xp = progress.xp;
        player.kills = progress.kills;
        player.deaths = progress.deaths;
      }
    } catch (err) {
      captureServerError(err, {
        message: '[arena] failed to load profile:',
        tags: { where: 'arena.loadProfile', roomId: this.roomId, sessionId },
        extra: { playerId, characterClass },
        user: playerId !== undefined ? { id: String(playerId) } : undefined,
      });
    }
  }

  protected override removeClient(client: Client): void {
    // Persist progression first — `flushProfile` reads the replicated player,
    // which `baseRemove` then deletes.
    this.flushProfile(client.sessionId);
    this.baseRemove(client.sessionId);
    this.cooldowns.delete(client.sessionId);
    this.auraNextAt.delete(client.sessionId);
    this.respawnAt.delete(client.sessionId);
    this.pendingCasts.delete(client.sessionId);
    this.attackTargets.delete(client.sessionId);
    this.attackReadyAt.delete(client.sessionId);
    this.displacements.delete(client.sessionId);
    this.ninjaEStates.delete(client.sessionId);
    this.guns?.remove(client.sessionId);
    this.gunViews.delete(client.sessionId);
    this.stopChannel(client.sessionId);
    this.perkSystem?.reset(client.sessionId);
    this.match.forget(client.sessionId);
    this.unregisterSession(client);
  }

  /** Persist this session's progression delta (live totals − loaded base) on leave. */
  private flushProfile(sessionId: string): void {
    const profile = this.profiles.get(sessionId);
    this.profiles.delete(sessionId);
    const db = getPool();
    const player = this.state.players.get(sessionId);
    if (!db || !profile || !player) return;
    persistProfileDelta(db, profile, player, this.match.outcomeFor(sessionId));
  }

  // --- Gun Mode Zombie input ---------------------------------------------

  /** Wire the gun-mode weapon handlers (fire / switch / reload / aim). The
   *  {@link GunSystem} owns the magazine / fire-rate / reload rules. */
  /** Resolve a normalized aim vector, falling back to the player's facing. */
  // --- Ability input -----------------------------------------------------

  private handleCast(
    sessionId: string,
    message: ClientMessagePayloads[ClientMessage.CastAbility],
  ): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive || !isAbilityKind(message?.ability)) return;
    // A cast means the charge was released — end the wind-up.
    player.chargeAbility = '';


    // Gun Mode Zombie disables the entire ability kit — the player fights with
    // guns only. Reject every cast server-side too, so a crafted client can't
    // fire a locked ability.
    if (this.mode.usesGuns) return;

    // Crowd control: a stun blocks everything; a silence blocks casting.
    if (isStunned(player) || isSilenced(player)) {
      this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, { ability: message.ability });
      return;
    }

    const ability = message.ability;
    const config = this.tuning.abilityFor(player.characterClass, ability);
    const cd = this.cooldowns.get(sessionId);
    if (!cd) return;

    // While a channel (the priest beam) is active, re-pressing its key interrupts
    // it and every OTHER ability is locked out for the duration.
    if (this.channels.has(sessionId)) {
      if (player.channelAbility === ability) {
        this.stopChannel(sessionId);
      } else {
        this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, { ability });
      }
      return;
    }

    // Cooldown + mana gates, plus: can't start a cast while already casting.
    // A small grace absorbs latency so a just-ready client cast isn't dropped.
    const state = this.ninjaEStates.get(sessionId);
    const inRecastWindow = state && this.simTime >= state.windowStart && this.simTime <= state.windowEnd;

    if (!inRecastWindow && (cd[ability] ?? 0) > this.simTime + CAST_COOLDOWN_GRACE_MS) {

      this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, { ability });
      return;
    }

    let manaCost = config.manaCost;
    if (ability === 'ninja_e' && inRecastWindow) {
      manaCost += 10;
    }
    if (player.mana < manaCost) {

      this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, { ability });
      return;
    }
    if (this.pendingCasts.has(sessionId)) {
      if (ability === 'ninja_r') {
        this.pendingCasts.delete(sessionId);
      } else {

        this.clients.getById(sessionId)?.send(ServerMessage.ResetCooldown, { ability });
        return;
      }
    }

    // Unit-targeted abilities lock onto a player by id (must be alive and in
    // range); fall back to self if the target is gone/out of range.
    let unitTargetId: string | undefined;
    if (config.aim === 'unit') {
      const t = message.targetId ? this.state.players.get(message.targetId) : undefined;
      if (
        t &&
        t.alive &&
        Math.hypot(t.x - player.x, t.z - player.z) <= config.range + PLAYER_RADIUS
      ) {
        unitTargetId = t.sessionId;
      } else {
        unitTargetId = sessionId; // self-cast fallback (e.g. renew on yourself)
      }
    }

    // Direction: use the requested vector, falling back to the facing direction.
    let dirX = Number.isFinite(message.dirX) ? message.dirX : 0;
    let dirZ = Number.isFinite(message.dirZ) ? message.dirZ : 0;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1e-3) {
      dirX /= len;
      dirZ /= len;
    } else {
      dirX = Math.sin(player.rotation);
      dirZ = Math.cos(player.rotation);
    }

    // Ground-targeted abilities: resolve the clicked point, clamped to `range`
    // from the caster (and the arena), and face it.
    let targetX: number | undefined;
    let targetZ: number | undefined;
    if (config.aim === 'point' && Number.isFinite(message.tx) && Number.isFinite(message.tz)) {
      const limit = this.arenaLimit - PLAYER_RADIUS;
      const limitZ = this.arenaLimitZ - PLAYER_RADIUS;
      let ox = (message.tx as number) - player.x;
      let oz = (message.tz as number) - player.z;
      const d = Math.hypot(ox, oz);
      if (d > config.range && d > 1e-3) {
        ox = (ox / d) * config.range;
        oz = (oz / d) * config.range;
      }
      targetX = clamp(player.x + ox, -limit, limit);
      targetZ = clamp(player.z + oz, -limitZ, limitZ);
      if (d > 1e-3) {
        dirX = ox / Math.hypot(ox, oz);
        dirZ = oz / Math.hypot(ox, oz);
      }
    }

    // Unit-targeted: face the locked target (when it isn't yourself).
    if (unitTargetId && unitTargetId !== sessionId) {
      const t = this.state.players.get(unitTargetId);
      if (t) {
        const tx = t.x - player.x;
        const tz = t.z - player.z;
        if (Math.hypot(tx, tz) > 1e-3) {
          dirX = tx / Math.hypot(tx, tz);
          dirZ = tz / Math.hypot(tx, tz);
        }
      }
    }

    // Commit cost + cooldown at cast start, then face the cast direction.
    const perkMods = this.perkSystem?.getModifiers(sessionId);
    spendMana(player, manaCost * (perkMods?.manaCostMult ?? 1));
    if (ability === 'ninja_e') {
      if (inRecastWindow && state) {
        const baseCd = 6000 * (perkMods?.cooldownMult ?? 1);
        cd[ability] = Math.max(cd[ability] ?? 0, this.simTime) + baseCd;
        this.ninjaEStates.delete(sessionId);
      } else {
        const dashEnd = this.simTime + 214;
        const windowStart = dashEnd + 300;
        const windowEnd = dashEnd + 1300;
        cd[ability] = windowStart;
        this.ninjaEStates.set(sessionId, {
          stage: 1,
          windowStart,
          windowEnd,
          perkMods: perkMods || { manaCostMult: 1, cooldownMult: 1 },
          firstCastTime: this.simTime,
        });
      }
    } else {
      const baseCd = config.cooldownMs * (perkMods?.cooldownMult ?? 1);
      cd[ability] = Math.max(cd[ability] ?? 0, this.simTime) + baseCd;

    }
    player.rotation = Math.atan2(dirX, dirZ);

    // Broadcast at cast START so clients play the cast animation / wind-up VFX
    // immediately, whether or not the effect has a wind-up.
    this.broadcast(ServerMessage.AbilityCast, {
      casterId: sessionId,
      ability,
      x: player.x,
      y: PROJECTILE_Y,
      z: player.z,
      dirX,
      dirZ,
      tx: targetX,
      tz: targetZ,
      targetId: unitTargetId,
    });

    // Assert the authoritative cast pose for the wind-up (or a brief window for
    // instant abilities).
    this.animOneShots.set(sessionId, {
      name: 'cast',
      until: this.simTime + Math.max(config.castTimeMs, INSTANT_ONESHOT_MS),
    });

    if (config.channelMs) {
      // Sustained channel (the priest beam): start ticking; the player keeps
      // moving and can re-aim, but can't cast until it ends or is re-pressed.
      this.startChannel(sessionId, player, config, dirX, dirZ);
    } else if (config.castTimeMs > 0) {
      // Rooted wind-up: cancel any move and resolve when the timer elapses.
      this.destinations.delete(sessionId);
      this.pendingCasts.set(sessionId, {
        ability,
        config,
        dirX,
        dirZ,
        targetX,
        targetZ,
        unitTargetId,
        resolveAt: this.simTime + config.castTimeMs,
      });
    } else {
      let activeConfig = config;
      if (ability === 'ninja_e' && inRecastWindow && state) {
        activeConfig = {
          ...config,
          effects: [
            { type: 'dash', distance: 6, speed: 32 },
            { type: 'shield', amount: 25, durationMs: 3500 },
          ],
        };
      }
      const aoeSizeBonus = this.perkSystem?.getModifiers(sessionId)?.aoeSizeBonus ?? 0;
      this.combat.resolveCast(player, activeConfig, dirX, dirZ, targetX, targetZ, unitTargetId, aoeSizeBonus);
    }
  }

  /** Begin a channel: record it, mark the player as channelling, and seed the
   *  replicated aim direction (the client streams updates via `AimChannel`). */
  private startChannel(
    sessionId: string,
    player: Player,
    config: AbilityDef,
    dirX: number,
    dirZ: number,
  ): void {
    player.channelAbility = config.id;
    player.channelDirX = dirX;
    player.channelDirZ = dirZ;
    this.channels.set(sessionId, {
      config,
      endAt: this.simTime + (config.channelMs ?? 0),
      objTickAt: this.simTime, // first object tick lands immediately
      engaged: new Map(),
    });
  }

  /** End a channel (timer elapsed, interrupted, CC'd, died, or left). */
  private stopChannel(sessionId: string): void {
    if (!this.channels.delete(sessionId)) return;
    const player = this.state.players.get(sessionId);
    if (player) player.channelAbility = '';
  }

  /** True if (ox,oz) lies inside the beam capsule — a ray from the caster along
   *  its aim, `range` long and `beamWidth` wide, padded by the object's radius. */
  /** Per-tick channel processing: drop channels whose caster can no longer hold
   *  them (dead / stunned / silenced / elapsed). Enemies take 12 the instant they
   *  enter the beam, then every `channelTickMs`; objects tick on a shared clock. */
  private processChannels(): void {
    this.channels.forEach((ch, sessionId) => {
      const caster = this.state.players.get(sessionId);
      if (!caster || !caster.alive || isStunned(caster) || isSilenced(caster)) {
        this.stopChannel(sessionId);
        return;
      }
      if (this.simTime >= ch.endAt) {
        this.stopChannel(sessionId);
        return;
      }
      const config = ch.config;
      const tickMs = config.channelTickMs ?? 500;

      // Enemies: an on-hit burst on entry, then a per-target DoT. Tracked each
      // game tick so a swept-onto target is hit "as soon as it hits".
      this.state.players.forEach((target, tid) => {
        if (tid === sessionId || !target.alive) return;
        if (!inBeam(caster, target.x, target.z, PLAYER_RADIUS, config)) {
          ch.engaged.delete(tid); // left the beam — re-entering re-triggers on-hit
          return;
        }
        const next = ch.engaged.get(tid);
        if (next === undefined) {
          // Just entered: the immediate on-hit, then schedule its first DoT.
          this.combat.dealDamage(target, config.damage, sessionId);
          ch.engaged.set(tid, this.simTime + tickMs);
        } else if (this.simTime >= next) {
          this.combat.dealDamage(target, config.damage, sessionId);
          ch.engaged.set(tid, next + tickMs);
        }
      });
      // Prune engaged ids for players that left/died (forEach above handles those
      // still present; drop any no-longer-in-state ids).
      for (const id of [...ch.engaged.keys()]) {
        if (!this.state.players.get(id)?.alive) ch.engaged.delete(id);
      }

      // Objects: a shared 0.5s clock (first tick immediate), since they're static.
      while (this.simTime >= ch.objTickAt) {
        this.applyBeamObjectDamage(caster, config);
        ch.objTickAt += tickMs;
      }
    });
  }

  /** Damage the objects inside the beam capsule — cover structures, barrels and
   *  destructibles (players are handled per-target in {@link processChannels}). */
  private applyBeamObjectDamage(caster: Player, config: AbilityDef): void {
    const dx = caster.channelDirX;
    const dz = caster.channelDirZ;
    // Cover structures (trailers / cars / dumpsters) in the beam take its damage.
    this.state.structures.forEach((s) => {
      if (!s.destroyed && inBeam(caster, s.x, s.z, s.radius, config)) {
        this.combat.damageStructure(s.id, config.damage, dx, dz);
      }
    });
    // Burning barrels caught in the beam are launched + detonated.
    this.state.barrels.forEach((b) => {
      if (b.alive && inBeam(caster, b.x, b.z, BARREL_RADIUS, config)) {
        this.barrels.trigger(b, dx, dz, caster.sessionId);
      }
    });
    // Oil drums / tires: shoved (and drums chipped) along the beam.
    this.destructibles.damageInBeam(
      caster.x,
      caster.z,
      dx,
      dz,
      config.range,
      (config.beamWidth ?? 0.6) / 2,
      caster.sessionId,
      config.damage,
    );
  }

  /**
   * Auto-attack tick: face the target, chase it into range, then strike on the
   * class's attack-speed timer (a projectile for ranged classes, a direct hit
   * for melee). Clears the order if the target is gone or dead.
   */
  private updateAutoAttack(attacker: Player, sessionId: string, dt: number): void {
    const targetId = this.attackTargets.get(sessionId);
    // The target is a living player, a live barrel, or a standing cover structure.
    const targetPlayer = targetId ? this.state.players.get(targetId) : undefined;
    const targetBarrel = targetPlayer ? undefined : targetId ? this.barrels.liveBarrel(targetId) : undefined;
    const targetStructure =
      targetPlayer || targetBarrel ? undefined : targetId ? this.cover.liveStructure(targetId) : undefined;
    if ((!targetPlayer || !targetPlayer.alive) && !targetBarrel && !targetStructure) {
      this.attackTargets.delete(sessionId);
      return;
    }
    const tx = targetPlayer ? targetPlayer.x : targetBarrel ? targetBarrel.x : targetStructure!.x;
    const tz = targetPlayer ? targetPlayer.z : targetBarrel ? targetBarrel.z : targetStructure!.z;

    const cfg = AUTO_ATTACKS[attacker.characterClass as CharacterClass];
    const dx = tx - attacker.x;
    const dz = tz - attacker.z;
    const dist = Math.hypot(dx, dz);
    const ndx = dist > 1e-3 ? dx / dist : 0;
    const ndz = dist > 1e-3 ? dz / dist : 0;
    if (dist > 1e-3) attacker.rotation = Math.atan2(ndx, ndz);

    const isZombie = this.zombieMode && this.bots.has(sessionId);
    if (dist > cfg.range) {
      if (isStunned(attacker) || isRooted(attacker)) {
        // Stunned/rooted zombies can't move to chase, but they keep their target.
        if (isZombie) this.attackReadyAt.delete(sessionId);
        return;
      }
      // Chase: walk toward the target, stopping right at attack range (slows/
      // hastes scale the chase speed, same as locomotion). Zombies chase at
      // their own (jittered) pace and steer off the bee-line so the horde fans
      // out; everyone else heads straight at class walk speed.
      const limit = this.arenaLimit - PLAYER_RADIUS;
      const limitZ = this.arenaLimitZ - PLAYER_RADIUS;
      let baseSpeed: number;
      let cdx = ndx;
      let cdz = ndz;
      if (isZombie) {
        const ai = this.zombie!.aiFor(sessionId);
        const zBase = zombieSpeedForLevel(this.zombieDirector?.currentLevel() ?? 1) - this.mode.walkSpeedPenalty;
        let speedOffset = ai.speedOffset;
        if (attacker.skinId === ZOMBIE_MINIBOSS_SKIN_ID && attacker.hp < attacker.maxHp * 0.5) {
          speedOffset = -0.5; // Berserk speed multiplier offset (made 1 unit faster)
        }
        baseSpeed = Math.max(
          1,
          zBase + speedOffset,
        );
        // Stuck detection: track net movement per tick. Against wide / multi-circle
        // cover the collision push-out can trap a zombie oscillating at a surface
        // (it re-aims straight at the player, re-rams, gets pushed back). If it
        // stops making progress for a short window, commit to a forced ~perpendicular
        // detour to slide off the obstacle, then resume the bee-line.
        const moved = Math.hypot(attacker.x - ai.lastX, attacker.z - ai.lastZ);
        ai.lastX = attacker.x;
        ai.lastZ = attacker.z;
        if (moved < ZOMBIE_STUCK_MOVE_EPS) ai.stuckTicks += 1;
        else ai.stuckTicks = 0;
        if (ai.stuckTicks >= ZOMBIE_STUCK_TICKS && this.simTime >= ai.detourUntil) {
          // Commit (or re-commit) a detour. If a previous detour just ran and we're
          // still stuck, flip to the other side to try around the other way.
          ai.detourSide = ai.detourUntil > 0 ? -ai.detourSide : ai.wander >= 0 ? 1 : -1;
          ai.detourUntil = this.simTime + ZOMBIE_DETOUR_MS;
        }

        let ang: number;
        if (this.simTime < ai.detourUntil) {
          // Mid-detour: steer hard off the bee-line to clear the obstacle.
          ang = Math.atan2(ndx, ndz) + ai.detourSide * ZOMBIE_DETOUR_RAD;
        } else {
          // Arc off the straight line toward this zombie's COMMITTED flank side by
          // an angle that ramps with distance (full when far, zero at attack range)
          // so the horde curls around to swarm you, then spirals in to strike.
          // Re-roll only the arc magnitude on the AI's clock — the side has a 40%
          // chance to switch so they dynamically weave/flank unpredictably.
          if (this.simTime >= ai.wanderUntil) {
            let side = ai.wander >= 0 ? 1 : -1;
            if (Math.random() < 0.4) {
              side = -side;
            }
            ai.wander = side * (0.55 + Math.random() * 0.45);
            ai.wanderUntil = this.simTime + this.zombie!.rollWanderInterval();
          }
          const ramp = Math.min(1, (dist - cfg.range) / ZOMBIE_WANDER_FALLOFF);
          const isSprinter = attacker.skinId === ZOMBIE_SPRINTER_SKIN_ID;
          const wanderFactor = isSprinter ? 0.3 : 1.0;
          ang = Math.atan2(ndx, ndz) + ai.wander * ZOMBIE_WANDER_MAX_RAD * ramp * wanderFactor;
        }
        cdx = Math.sin(ang);
        cdz = Math.cos(ang);
        attacker.rotation = ang; // face where it's actually heading
      } else {
        baseSpeed = this.tuning.walkSpeedFor(attacker.characterClass) - this.mode.walkSpeedPenalty;
      }
      const perkSpeed = getPerkMoveSpeedMult(this.perkSystem, attacker);
      const speed = (baseSpeed + perkSpeed.bonus) * moveSpeedMultiplier(attacker) * perkSpeed.mult;
      const step = Math.min(speed * dt, dist - cfg.range + 0.01);
      if (isZombie) {
        // Slide along cover instead of stopping dead at it: resolving the stepped
        // position against static obstacles preserves the tangential component, so
        // a zombie glides around a circle rather than oscillating into its face.
        const r = attacker.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
        const slid = collideObstacles(attacker.x + cdx * step, attacker.z + cdz * step, this.zombieStaticObstacles, r);
        attacker.x = clamp(slid.x, -limit, limit);
        attacker.z = clamp(slid.z, -limitZ, limitZ);
      } else {
        attacker.x = clamp(attacker.x + cdx * step, -limit, limit);
        attacker.z = clamp(attacker.z + cdz * step, -limitZ, limitZ);
      }
      // Out of range: re-arm a zombie's first-swing wind-up so it can't bite the
      // instant it closes back in (the in-range branch sees no timer → winds up).
      if (isZombie) this.attackReadyAt.delete(sessionId);
      return;
    }

    // A zombie that JUST reached its prey winds up first — no instant 0-delay hit.
    // The next time it's ready the strike below lands; a telegraph pose plays
    // through the wind-up. (Re-armed in the chase branch each time it re-engages.)
    if (isZombie && !this.attackReadyAt.has(sessionId)) {
      this.attackReadyAt.set(sessionId, this.simTime + ZOMBIE_ATTACK_WINDUP_MS);
      this.animOneShots.set(sessionId, {
        name: 'attack',
        until: this.simTime + ZOMBIE_ATTACK_WINDUP_MS,
      });
      return;
    }

    // In range and armed: strike when the timer is ready. Zombies swing on a
    // slow, randomized interval; everyone else uses the class attack-speed timer.
    if (this.simTime < (this.attackReadyAt.get(sessionId) ?? 0)) return;
    if (isStunned(attacker) || isBlinded(attacker)) return;
    // Zombies swing at a random moment in [MIN, MAX]; a variant's attack bonus
    // (the Fat) shaves that down, floored so it can't reach zero.
    const interval = isZombie
      ? Math.max(
          150,
          ZOMBIE_ATTACK_MIN_MS +
            Math.random() * (ZOMBIE_ATTACK_MAX_MS - ZOMBIE_ATTACK_MIN_MS) -
            this.zombie!.aiFor(sessionId).attackBonusMs,
        )
      : cfg.cooldownMs / attackSpeedMultiplier(attacker);
    this.attackReadyAt.set(sessionId, this.simTime + interval);
    this.animOneShots.set(sessionId, {
      name: 'attack',
      until: this.simTime + Math.min(interval, 400),
    });
    let dmg = cfg.damage;
    if (attacker.skinId === ZOMBIE_MINIBOSS_SKIN_ID) {
      dmg *= 3;
    }
    if (cfg.kind === 'ranged') {
      // The projectile resolves the hit (player / barrel / structure) on impact.
      this.projectiles.spawnAutoProjectile(attacker, ndx, ndz, cfg);
    } else if (targetPlayer) {
      // Dodge check: Phantom perk gives a chance to avoid a melee hit. (In zombie
      // mode only zombies melee humans; in the FFA arena any melee attacker
      // triggers it, so the perk is testable there too.)
      if (this.perkSystem) {
        const dodgeChance = this.perkSystem.getModifiers(targetPlayer.sessionId).dodgeChance;
        if (dodgeChance > 0 && Math.random() < dodgeChance) {
          // Dodged — skip the damage entirely.
          return;
        }
      }
      this.combat.dealDamage(targetPlayer, dmg, sessionId);
      // Reflect (Stoneskin / Colossus): bounce flat damage back at a melee
      // attacker. Tagged 'reflect' so it's inert (no scaling, no re-procs).
      if (this.perkSystem && attacker.alive) {
        const reflect = this.perkSystem.getModifiers(targetPlayer.sessionId).reflectDamage;
        if (reflect > 0) this.combat.dealDamage(attacker, reflect, targetPlayer.sessionId, 'reflect');
      }
    } else if (targetBarrel) {
      // Melee shove: launch the barrel away from the attacker.
      this.combat.triggerBarrel(targetBarrel, ndx, ndz, sessionId);
    } else if (targetStructure) {
      // Melee strike: chip the structure's HP (crumbles at 0), shoving a car the
      // way the blow is aimed.
      this.combat.damageStructure(targetStructure.id, dmg, ndx, ndz);
    }
  }

  // --- Simulation --------------------------------------------------------

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
    // Once a winner is decided, freeze the world — players hold their final pose
    // under the results overlay until they leave (or the room auto-disposes).
    if (this.match.matchOver) return;
    const dt = deltaMs / 1000;

    // Prune expired Ninja E recast states and apply standard cooldown
    this.ninjaEStates.forEach((state, sessionId) => {
      if (this.simTime > state.windowEnd) {
        const cd = this.cooldowns.get(sessionId);
        if (cd) {
          cd['ninja_e'] = this.simTime + 3000 * (state.perkMods?.cooldownMult ?? 1);
        }
        this.ninjaEStates.delete(sessionId);
      }
    });

    const limit = this.arenaLimit - PLAYER_RADIUS;
    const limitZ = this.arenaLimitZ - PLAYER_RADIUS;

    // Zombie waves: spawn/advance hordes before the bot AI runs, so freshly
    // spawned zombies pick a target and start chasing this same tick.
    if (this.zombieDirector) this.zombieDirector.update(this.simTime);
    // Perk system tick: auto-pick for AFK players.
    if (this.perkSystem) this.perkSystem.update(this.simTime);

    // Treasure chest spawning (modes with a chest objective — PvP arenas).
    if (this.mode.usesChest) {
      let aliveChestsCount = 0;
      this.state.structures.forEach((s) => {
        if (s.assetId === 'prop.arena.chest' && !s.destroyed) {
          aliveChestsCount++;
        }
      });
      if (aliveChestsCount === 0) {
        this.chestSpawnTimer -= deltaMs;
        if (this.chestSpawnTimer <= 0) {
          this.chestSpawnTimer = 0;
          this.trySpawnChest();
        }
      }
    }

    // AI bots decide their intent first — they write the same `destinations` /
    // `attackTargets` / cast seams human input does, consumed by the loop below.
    if (this.bots.size > 0) this.botDirector.update(this.simTime, this.bots);

    // Zombie mode: living zombies are solid to players. Feed them as extra
    // obstacle circles into each human's locomotion (the SAME shared step the
    // client predicts with — using `isZombieSkin` to pick the same bodies — so a
    // player is blocked by the horde without rubber-banding). `height: 0` makes
    // them satisfy ArenaObstacle for the post-move resolve too.
    // Reused scratch lists (cleared + re-pushed) instead of fresh arrays each tick.
    const zombieBlockers = this.zombieBlockers;
    const propObstacles = this.propObstacles;
    zombieBlockers.length = 0;
    propObstacles.length = 0;
    this.zombieStaticObstacles.length = 0;
    if (this.zombieMode) {
      this.bots.forEach((_profile, id) => {
        const z = this.state.players.get(id);
        if (z?.alive) {
          const r = z.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
          zombieBlockers.push({ x: z.x, z: z.z, radius: r, height: 0 });
        }
      });
      this.state.barrels.forEach((b) => {
        if (b.alive) propObstacles.push({ x: b.x, z: b.z, radius: 0.45, height: 0 });
      });
      this.state.destructibles.forEach((d) => {
        propObstacles.push({ x: d.x, z: d.z, radius: 0.45, height: 0 });
      });
      // Static cover + props: what zombies slide against while chasing and are
      // re-resolved against post-collision. Built once; shared across the tick.
      for (const o of this.obstacles) this.zombieStaticObstacles.push(o);
      for (const p of propObstacles) this.zombieStaticObstacles.push(p);
    }

    this.state.players.forEach((player, sessionId) => {
      if (!player.alive) {
        player.animState = 'die';
        player.attackTargetId = '';
        this.pendingCasts.delete(sessionId);
        this.animOneShots.delete(sessionId);
        this.attackTargets.delete(sessionId);
        this.displacements.delete(sessionId);
        this.stopChannel(sessionId);
        if (player.statuses.length > 0) player.statuses.clear();
        player.shield = 0;
        player.holding = ''; // a carried object is lost on death
        // What death means here is the mode's call: a slain zombie is REMOVED
        // (vanishes immediately — no corpse animation, clears the "all dead" check
        // at once); a co-op human LINGERs (death is final, stays to spectate/quit
        // and the all-fallen check below ends the run); everyone else RESPAWNs.
        const policy = deathPolicy(this.mode, this.bots.has(sessionId));
        if (policy === 'remove') {
          if (player.skinId === ZOMBIE_MINIBOSS_SKIN_ID) {
            this.pickables.spawnGround('heal_pack', player.x, player.z, 4);
          }
          // Charge any trap whose radius contains this death (no-op when no traps
          // exist). Position is still valid pre-removal.
          this.traps.recordZombieDeath(player.x, player.z);
          this.removeBot(sessionId);
          return;
        }
        if (policy === 'linger') return;
        const respawn = this.respawnAt.get(sessionId);
        if (respawn !== undefined && this.simTime >= respawn) {
          this.resetPlayer(player);
          this.verticalVelocity.set(sessionId, 0);
          this.grounded.set(sessionId, true);
          this.respawnAt.delete(sessionId);
        }
        return;
      }

      const perkMods = this.perkSystem?.getModifiers(sessionId);
      let manaRegenMult = perkMods?.manaRegenMult ?? 1;
      if (player.statuses.some((s) => s.kind === 'buff')) {
        manaRegenMult *= 1.5;
      }
      regenMana(player, MANA_REGEN * this.mode.manaRegenMult * manaRegenMult, dt);
      // Crowd control / buffs / dot-hot: prune, tick, and expire shields.
      this.combat.updateStatuses(player);

      // Colossus damaging aura: tick flat damage to enemies in range once per
      // second. Tagged 'aura' so it's inert (no scaling / re-procs).
      if (perkMods && perkMods.auraDps > 0) {
        if (this.simTime >= (this.auraNextAt.get(sessionId) ?? 0)) {
          this.auraNextAt.set(sessionId, this.simTime + 1000);
          this.combat.forEachEnemyInRadius(player.x, player.z, AURA_RADIUS, sessionId, (enemy) =>
            this.combat.dealDamage(enemy, perkMods.auraDps, sessionId, 'aura'),
          );
        }
      }

      // Update Mini-Boss AI if this player is the mini-boss
      if (player.skinId === ZOMBIE_MINIBOSS_SKIN_ID) {
        this.updateMiniBossAI(player, sessionId);
        // Knock dynamic objects (barrels, drums, tires) over while walking
        this.barrels.triggerInRadius(player.x, player.z, 1.6, sessionId);
        this.destructibles.pushInRadius(player.x, player.z, 1.6, sessionId, 1);
      }

      // Capture pre-move position to derive locomotion (run vs idle) below.
      const startX = player.x;
      const startZ = player.z;

      const m = this.tuning.movement;

      // Humans collide with the living horde; zombies collide with static cover and props
      // (they separate from each other via resolveZombieCollisions).
      const moveObstacles =
        !this.bots.has(sessionId)
          ? (zombieBlockers.length > 0 ? this.obstacles.concat(zombieBlockers) : this.obstacles)
          : (this.zombieMode ? this.zombieStaticObstacles : this.obstacles);

      // Forced displacement (dash / knockback) overrides locomotion while active.
      const disp = this.displacements.get(sessionId);
      const displacing = !!disp && this.simTime < disp.until;
      if (disp && !displacing) this.displacements.delete(sessionId);

      // Resolve a finished wind-up before this tick's movement decision.
      const pending = this.pendingCasts.get(sessionId);
      if (pending && this.simTime >= pending.resolveAt) {
        const pendingAoeBonus = this.perkSystem?.getModifiers(sessionId)?.aoeSizeBonus ?? 0;
        this.combat.resolveCast(
          player,
          pending.config,
          pending.dirX,
          pending.dirZ,
          pending.targetX,
          pending.targetZ,
          pending.unitTargetId,
          pendingAoeBonus,
        );
        this.pendingCasts.delete(sessionId);
      }

      if (displacing && disp) {
        // Slide along the displacement velocity (clamped to the arena).
        player.x = clamp(player.x + disp.vx * dt, -limit, limit);
        player.z = clamp(player.z + disp.vz * dt, -limitZ, limitZ);
        // Damaging dash (e.g. Charge): hit each enemy swept through once, and
        // physically collide with the props in the dash lane — launch burning
        // barrels and shove/scatter oil drums and tires it ploughs into.
        if (disp.damage && disp.hit) {
          const hitR = PLAYER_RADIUS * 2;
          const dmg = disp.damage;
          const fromId = disp.fromId ?? sessionId;
          const hit = disp.hit;
          this.state.players.forEach((other, oid) => {
            if (oid === sessionId || !other.alive || hit.has(oid)) return;
            const ddx = other.x - player.x;
            const ddz = other.z - player.z;
            if (ddx * ddx + ddz * ddz <= hitR * hitR) {
              hit.add(oid);
              this.combat.dealDamage(other, dmg, fromId);
            }
          });
          // Props: barrels launch (idempotent once armed); drums/tires get shoved
          // (drums are rate-limited, tires scatter once) — a pure physical bump.
          this.barrels.triggerInRadius(player.x, player.z, DASH_IMPACT_RADIUS, fromId);
          this.destructibles.pushInRadius(player.x, player.z, DASH_IMPACT_RADIUS, fromId);
        } else if (this.zombieMode || player.characterClass === 'ninja') {
          // In zombie mode, or if the player is a Ninja (Shadow Dash), even non-damaging dashes knock barrels/drums over!
          const fromId = disp.fromId ?? sessionId;
          this.barrels.triggerInRadius(player.x, player.z, DASH_IMPACT_RADIUS, fromId);
          this.destructibles.pushInRadius(player.x, player.z, DASH_IMPACT_RADIUS, fromId);
        }
      } else if (pending) {
        // Rooted wind-up: no movement while casting.
      } else if (isStunned(player) || isRooted(player)) {
        // Hard CC: no movement. A stun also drops the move order and auto-attack.
        // For zombies, we preserve the auto-attack target so they can still bite if prey is in range.
        this.destinations.delete(sessionId);
        const isZombie = this.zombieMode && this.bots.has(sessionId);
        if (isStunned(player) && !isZombie) {
          this.attackTargets.delete(sessionId);
        }
        if (isZombie && this.autoAttackEnabled && this.attackTargets.has(sessionId)) {
          this.updateAutoAttack(player, sessionId, dt);
        }
      } else if (this.autoAttackEnabled && this.attackTargets.has(sessionId)) {
        // Auto-attack: chase the target into range, then strike on a timer.
        this.updateAutoAttack(player, sessionId, dt);
      } else {
        // Point-and-click movement: the shared deterministic step (also run by
        // the client predictor) walks toward the destination and slides around
        // obstacles, so client and server stay in lockstep. Slows/hastes scale
        // the walk speed.
        // Gun Mode Zombie: the body faces the mouse cursor (streamed via
        // AimWeapon), not the movement direction — so preserve the aim rotation
        // across the step (twin-stick: strafe while aiming where you click).
        const gunAiming = this.gunMode && player.team === 'blue';
        const aimRotation = player.rotation;
        const arrived = stepMove(
          player,
          this.destinations.get(sessionId) ?? null,
          {
            speed: (() => {
              const perk = getPerkMoveSpeedMult(this.perkSystem, player);
              return ((this.tuning.walkSpeedFor(player.characterClass) - this.mode.walkSpeedPenalty) +
                perk.bonus) *
                moveSpeedMultiplier(player) *
                perk.mult *
                (gunAiming ? gunMoveSpeedMult(this.gunViews.get(sessionId) ?? 'fps') : 1);
            })(),
            rotationSpeed: m.rotationSpeed,
            stoppingDistance: m.stoppingDistance,
            halfBounds: limit,
            halfBoundsZ: limitZ,
            obstacles: moveObstacles,
          },
          dt,
        );
        if (gunAiming) player.rotation = aimRotation;
        if (arrived) this.destinations.delete(sessionId);
      }

      // Resolve obstacle collisions for the non-move paths (auto-attack chase,
      // idle overlaps); stepMove already resolved the move path.
      // During a displacement (dash/knockback), collide against the same blockers
      // as normal movement (including zombie bodies/props) so dashing hits or slides on them.
      const r = player.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
      const collisionSet = moveObstacles;
      const fixed = collideObstacles(player.x, player.z, collisionSet, r);
      player.x = fixed.x;
      player.z = fixed.z;

      // Room expansion system: enforce section boundaries — prevent any entity
      // from walking through walls into locked sections.
      if (this.roomLayout) {
        const clamped = clampToUnlockedArea(
          player.x,
          player.z,
          this.roomLayout,
          this.state.unlockedSections,
          r,
          startX,
          startZ,
        );
        player.x = clamped.x;
        player.z = clamped.z;
      }

      // Vertical movement (gravity + jump impulse set by the Jump message).
      const g = applyGravity(player, this.verticalVelocity.get(sessionId) ?? 0, dt);
      this.verticalVelocity.set(sessionId, g.vy);
      if (g.grounded) this.grounded.set(sessionId, true);

      // Authoritative animation: one-shots over locomotion (Run while moving).
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
      this.resolveAvatarAnim(player, sessionId, moving);
      // Mirror the auto-attack target into replicated state for the attack banner.
      player.attackTargetId = this.attackTargets.get(sessionId) ?? '';
    });

    // Zombies are solid: keep a horde from collapsing onto a single point (and
    // off the top of a player) by separating overlapping bodies each tick.
    if (this.zombieMode) this.resolveZombieCollisions();

    this.processChannels();
    this.combat.processDashImpacts();
    // Projectiles/abilities apply their impulses, THEN we step the shared world
    // once, THEN the barrel/destructible systems read back the new transforms.
    this.projectiles.update(dt);
    // Gun Mode Zombie: complete any reloads whose timer elapsed this tick.
    this.guns?.update();
    // Roll any shot cars forward (moves their collider) BEFORE the physics step,
    // so drums/barrels collide against the car's new position this tick.
    this.cover.update(dt);
    this.physics.step();
    this.barrels.update();
    this.destructibles.update();
    // Pickables (despawn loose ones) + lingering ground zones (the molotov puddle's
    // periodic damage). Run after combat so they read this tick's positions.
    this.pickables.update();
    this.groundZones.update();
    // Traps: advance cooldown recharge + re-arm finished traps (no-op until one
    // is placed when a section unlocks).
    this.traps.update();
    // Co-op run: once every member has fallen, end the run (defeat → town).
    if (this.coopZombie) this.checkCoopGameOver();
    this.state.tick++;
  }

  /** Co-op zombie: when no human player is left alive, broadcast the game-over
   *  (the wave reached) so clients show the defeat screen, then tear the room down
   *  after a short linger. Latched so it fires exactly once, and only once at
   *  least one human has joined (so an empty just-created room doesn't end). */
  private checkCoopGameOver(): void {
    if (this.coopOver) return;
    let humans = 0;
    let aliveHumans = 0;
    this.state.players.forEach((player, id) => {
      if (this.bots.has(id)) return; // zombies don't count
      humans += 1;
      if (player.alive) aliveHumans += 1;
    });
    if (humans === 0 || aliveHumans > 0) return;
    this.coopOver = true;
    this.broadcast(ServerMessage.ZombieGameOver, {
      level: this.zombieDirector?.currentLevel() ?? this.state.zombieLevel,
    });
    this.clock.setTimeout(() => void this.disconnect(), MATCH_RESULT_LINGER_MS);
  }
  
  /** Find a safe spot and spawn a treasure chest, ensuring no overlap with cover, players, or spawn points. */
  private trySpawnChest(): void {
    // Only ever one chest alive at a time.
    let aliveChestsCount = 0;
    this.state.structures.forEach((s) => {
      if (s.assetId === 'prop.arena.chest' && !s.destroyed) aliveChestsCount++;
    });
    if (aliveChestsCount >= 1) return;

    // The chest always spawns on the central island (the one fixed feature) —
    // only reachable across the N/S bridges, so it's a contested objective.
    this.cover.spawnChest(ARENA_POND.x, ARENA_POND.z, 0);
  }

  /** Free the shared Rapier physics world when the room is torn down. */
  override onDispose(): void {
    this.physics?.free();
  }

  /** Toggle the auto-attack feature flag. Disabling clears any in-progress
   *  attack orders so nothing keeps swinging after the flag flips off. */
  private setAutoAttackEnabled(enabled: boolean): void {
    if (this.mode.autoAttack) return; // forced on for the whole room — ignore toggles
    this.autoAttackEnabled = enabled;
    if (!enabled) {
      this.attackTargets.clear();
      this.attackReadyAt.clear();
    }
  }

  /** Reset a player to a full, alive state at one of the layout's spawn points
   *  (a small random jitter avoids stacking when several share a point). */
  private resetPlayer(player: Player): void {
    const limit = this.arenaLimit - PLAYER_RADIUS;
    const limitZ = this.arenaLimitZ - PLAYER_RADIUS;
    // Spawn on this player's side of the arena (blue at +Z, red at −Z).
    const spawns = arenaSpawnsForTeam(player.team === 'red' ? 'red' : 'blue');
    const spawn = spawns[Math.floor(Math.random() * spawns.length)];
    const jitter = () => (Math.random() * 2 - 1) * 1.5;
    // FFA arena is longer N/S — push the team spawns out toward the ends (the Z
    // spawn coords are authored for the square arena). Zombie keeps them as-is.
    const zScale = this.zombieMode ? 1 : ARENA_HALF_Z / ARENA_HALF_SIZE;
    if (spawn) {
      player.x = clamp(spawn.x + jitter(), -limit, limit);
      player.z = clamp(spawn.z * zScale + jitter(), -limitZ, limitZ);
    } else {
      const range = this.arenaLimit - PLAYER_RADIUS * 2;
      player.x = (Math.random() * 2 - 1) * range;
      player.z = (Math.random() * 2 - 1) * range;
    }
    player.y = GROUND_Y;
    const stats = this.tuning.classStats[player.characterClass as CharacterClass];
    player.maxHp = stats.health * (this.perkSystem?.getModifiers(player.sessionId).maxHpMult ?? 1);
    player.maxMana = stats.mana;
    player.shield = 0;
    if (player.statuses.length > 0) player.statuses.clear();
    this.displacements.delete(player.sessionId);
    reviveFull(player);
    // Gun Mode Zombie: (re)issue a fresh weapon loadout to human players on every
    // spawn. Zombies/bots are 'red' and never carry guns.
    if (player.team === 'blue') this.guns?.equipLoadout(player);
  }

  // --- Practice bots -----------------------------------------------------

  /** Reconcile the bot population to the requested count + difficulty. Ignored in
   *  ranked matches so bots can never pollute matchmade scoring. Each bot is a
   *  full {@link Player} the existing simulation drives; only the AI decisions
   *  (in {@link BotDirector}) and this lifecycle are bot-specific. */
  private setBotPopulation(message: ClientMessagePayloads[ClientMessage.BotControl]): void {
    if (this.match.ranked || this.zombieMode) return;
    const count = clamp(Math.floor(Number(message?.count) || 0), 0, MAX_BOTS);
    const difficulty: BotDifficulty =
      message?.difficulty === 'easy' || message?.difficulty === 'hard'
        ? message.difficulty
        : 'medium';
    const characterClass = isCharacterClass(message?.characterClass)
      ? message.characterClass
      : undefined;

    // Retune any existing bots to the new difficulty.
    for (const profile of this.bots.values()) Object.assign(profile, makeBotProfile(difficulty));

    // Grow or shrink toward the target.
    while (this.bots.size < count) this.spawnBot(difficulty, characterClass);
    while (this.bots.size > count) {
      const id = this.bots.keys().next().value;
      if (id === undefined) break;
      this.removeBot(id);
    }
  }

  /** Add one AI bot: a red-team {@link Player} with synthetic ids, spawned via the
   *  shared {@link resetPlayer}. Mirrors `onJoin` minus the client/session/DB work. */
  private spawnBot(difficulty: BotDifficulty, characterClass?: CharacterClass): void {
    const id = `bot-${++this.botSeq}`;
    const player = new Player();
    player.sessionId = id;
    player.name = BOT_NAMES[(this.botSeq - 1) % BOT_NAMES.length] ?? 'Bot';
    player.characterClass =
      characterClass ??
      CHARACTER_CLASSES[Math.floor(Math.random() * CHARACTER_CLASSES.length)] ??
      'warrior';
    player.team = 'red';
    this.resetPlayer(player);

    this.state.players.set(id, player);
    this.verticalVelocity.set(id, 0);
    this.grounded.set(id, true);
    this.cooldowns.set(id, {});
    this.bots.set(id, makeBotProfile(difficulty));
  }

  /** Remove a bot and clear all of its per-session simulation state (the same
   *  set `removeClient` clears, minus the client/profile/session bookkeeping). */
  private removeBot(id: string): void {
    this.baseRemove(id);
    this.cooldowns.delete(id);
    this.respawnAt.delete(id);
    this.pendingCasts.delete(id);
    this.attackTargets.delete(id);
    this.attackReadyAt.delete(id);
    this.displacements.delete(id);
    this.zombieCorpseAt.delete(id);
    this.zombie?.forget(id);
    this.bots.delete(id);
  }

  // --- Zombie survival ---------------------------------------------------

  /**
   * Make zombies solid: a single circle-vs-circle separation relaxation each
   * tick so a horde fans out around its prey instead of stacking on one point.
   * Zombie↔zombie overlaps split the push between both; a zombie overlapping a
   * human is shoved fully clear (the human isn't moved — pushing a predicted,
   * point-and-click player server-side would rubber-band them). Pushed zombies
   * are re-resolved against cover so they can't be wedged into an obstacle.
   */
  private resolveZombieCollisions(): void {
    const zombies: Player[] = [];
    this.bots.forEach((_profile, id) => {
      const z = this.state.players.get(id);
      if (z?.alive) zombies.push(z);
    });
    if (zombies.length === 0) return;

    const startPos = new Map<string, { x: number; z: number }>();
    for (const z of zombies) {
      startPos.set(z.sessionId, { x: z.x, z: z.z });
    }

    // Zombie ↔ zombie: push apart equally (a deterministic axis when exactly
    // coincident, e.g. two spawned on the same jittered point).
    for (let i = 0; i < zombies.length; i++) {
      const a = zombies[i]!;
      const aRadius = a.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
      for (let j = i + 1; j < zombies.length; j++) {
        const b = zombies[j]!;
        const bRadius = b.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
        const minSep = aRadius + bRadius;
        const minSepSq = minSep * minSep;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minSepSq) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          dx = i % 2 === 0 ? 1 : -1;
          dz = 0;
          d = 1;
        }
        const push = (minSep - d) / 2;
        const ox = (dx / d) * push;
        const oz = (dz / d) * push;
        const aLimit = this.arenaLimit - aRadius;
        const bLimit = this.arenaLimit - bRadius;
        const aLimitZ = this.arenaLimitZ - aRadius;
        const bLimitZ = this.arenaLimitZ - bRadius;
        a.x = clamp(a.x - ox, -aLimit, aLimit);
        a.z = clamp(a.z - oz, -aLimitZ, aLimitZ);
        b.x = clamp(b.x + ox, -bLimit, bLimit);
        b.z = clamp(b.z + oz, -bLimitZ, bLimitZ);
      }
    }

    // Zombie ↔ human: shove the zombie fully out (leave the human put).
    this.state.players.forEach((human, id) => {
      if (this.bots.has(id) || !human.alive) return;
      const humanRadius = PLAYER_RADIUS;
      for (const z of zombies) {
        const zRadius = z.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
        const minSep = humanRadius + zRadius;
        const minSepSq = minSep * minSep;
        const dx = z.x - human.x;
        const dz = z.z - human.z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 >= minSepSq || dist2 < 1e-8) continue;
        const d = Math.sqrt(dist2);
        const push = minSep - d;
        const zLimit = this.arenaLimit - zRadius;
        z.x = clamp(z.x + (dx / d) * push, -zLimit, zLimit);
        z.z = clamp(z.z + (dz / d) * push, -zLimit, zLimit);
      }
    });

    // Re-resolve cover and prop collisions for any zombie nudged into an obstacle.
    // Reuses the cover+prop list built once for this tick in `update()` (props
    // move only in the later physics step, so it's still current here).
    const zombieStaticObstacles = this.zombieStaticObstacles;

    for (const z of zombies) {
      const zRadius = z.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
      const fixed = collideObstacles(z.x, z.z, zombieStaticObstacles, zRadius);
      z.x = fixed.x;
      z.z = fixed.z;
      // Enforce section boundaries so pushed zombies can't end up in locked areas.
      if (this.roomLayout) {
        const start = startPos.get(z.sessionId) ?? { x: z.x, z: z.z };
        const clamped = clampToUnlockedArea(
          z.x,
          z.z,
          this.roomLayout,
          this.state.unlockedSections,
          zRadius,
          start.x,
          start.z,
        );
        z.x = clamped.x;
        z.z = clamped.z;
      }
    }
  }


  private updateMiniBossAI(bot: Player, id: string): void {
    if (isStunned(bot) || isBlinded(bot)) return;
    if (this.simTime < (this.bossNextActionAt.get(id) ?? 0)) return;
    
    // Mini-boss target
    const targetId = this.attackTargets.get(id);
    const target = targetId ? this.state.players.get(targetId) : undefined;
    if (!target || !target.alive) {
      // Re-evaluate target or try to find the closest player
      let bestTarget: Player | undefined;
      let minD2 = Infinity;
      this.state.players.forEach((p) => {
        if (!p.alive || p.team === bot.team) return;
        const dx = p.x - bot.x;
        const dz = p.z - bot.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD2) {
          minD2 = d2;
          bestTarget = p;
        }
      });
      if (bestTarget) {
        this.attackTargets.set(id, bestTarget.sessionId);
        this.bossNextActionAt.set(id, this.simTime + 500); // short wait to re-aim
      }
      return;
    }

    // Set next action timestamp (3.5 to 6s cooldown)
    const interval = 3500 + Math.random() * 2500;
    this.bossNextActionAt.set(id, this.simTime + interval);

    // Roll for action: 50% chance fireball, 50% chance stomp shockwave
    const roll = Math.random();
    if (roll < 0.5) {
      // 5-way Fireball burst
      const baseAngle = Math.atan2(target.x - bot.x, target.z - bot.z);
      for (let i = 0; i < 5; i++) {
        const angle = baseAngle + i * ((2 * Math.PI) / 5);
        const dirX = Math.sin(angle);
        const dirZ = Math.cos(angle);
        
        // Spawn fireball projectile (3x slower velocity: 15 instead of 45)
        this.projectiles.spawnProjectile(
          bot,
          'fireball',
          dirX,
          dirZ,
          15,
          30,
          1.0,
          [{ type: 'damage', amount: 20 }]
        );
      }
    } else {
      // Stomp shockwave: circular shockwave hitting everyone in a 7.0 unit radius, dealing 25 damage and knocking them back.
      this.combat.forEachEnemyInRadius(bot.x, bot.z, 7.0, id, (enemy) => {
        this.combat.dealDamage(enemy, 25, id);
        this.combat.applyStatus(enemy, { kind: 'slow', durationMs: 2000, magnitude: 0.6 }, id);
        const dx = enemy.x - bot.x;
        const dz = enemy.z - bot.z;
        const dist = Math.hypot(dx, dz) || 1;
        this.combat.displace(enemy, dx / dist, dz / dist, 4, 18, 0, id);
      });
      // Play ground slam VFX on clients
      this.broadcast(ServerMessage.AbilityCast, {
        casterId: id,
        ability: 'ground_slam',
        x: bot.x,
        y: 0.05,
        z: bot.z,
        dirX: 0,
        dirZ: 1,
      });
    }
  }

  // --- Room expansion system -----------------------------------------------

  /** If `level` matches the next door's unlock wave, open that door and load
   *  the section behind it. No-op if all doors are already open. */
  private tryUnlockDoor(level: number): void {
    if (!this.roomLayout) {
      console.log(`[doors] tryUnlockDoor(${level}): no roomLayout — skipping`);
      return;
    }
    const nextIndex = this.state.unlockedSections;
    if (nextIndex >= this.roomLayout.doors.length) return;
    const door = this.roomLayout.doors[nextIndex]!;
    if (level < door.unlockWave) {
      console.log(`[doors] tryUnlockDoor(${level}): wave ${level} < required ${door.unlockWave} for door ${door.index}`);
      return;
    }

    console.log(`[doors] UNLOCKING door ${door.index} at (${door.x}, ${door.z}) — wave ${level}, width ${door.width}`);

    // Remove the door's wall from the collision set.
    this.cover.removeDoor(`door-${door.index}`);

    // Generate cover for the newly unlocked section.
    const section = this.roomLayout.sections[nextIndex];
    if (section) {
      // Traps are zombie-mode only and never appear in gun mode. Compute it up
      // front so cover generation can reserve its area (nothing spawns on a
      // trap) — the client mirrors this exact call so both layouts agree.
      const trap = this.gunMode ? null : trapForSection(this.state.layoutSeed, section);
      const sectionCover = generateSectionCover(this.state.layoutSeed, section, trap);
      this.cover.addSection(sectionCover.structures);
      this.barrels.addBarrels(sectionCover.barrels);
      this.destructibles.addObjects(sectionCover.drums, sectionCover.tireStacks);
      console.log(`[doors] Section ${section.name} loaded: ${sectionCover.structures.length} structures, ${sectionCover.barrels.length} barrels`);

      if (trap) {
        this.traps.addTrap(trap);
        console.log(`[traps] ${trap.kind} trap placed in ${section.name} at (${trap.x}, ${trap.z})`);
      }
    }

    // Increment the replicated counter (drives client rendering + minimap).
    this.state.unlockedSections = nextIndex + 1;
    console.log(`[doors] unlockedSections now = ${this.state.unlockedSections}`);

    // Broadcast a door-open event so clients play the crumble VFX.
    this.broadcast(ServerMessage.StructureCrumbled, {
      x: door.x,
      z: door.z,
      radius: door.width / 2,
    });
  }

}
