import { type Client } from '@colyseus/core';
import {
  ARENA_HALF_SIZE,
  arenaSpawnsForTeam,
  generateArenaLayout,
  collideObstacles,
  type ArenaObstacle,
  isLobbyMode,
  isTeam,
  teamSizeForMode,
  AUTO_ATTACKS,
  GROUND_Y,
  MANA_REGEN,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  TICK_MS,
  ClientMessage,
  type ClientMessagePayloads,
  ServerMessage,
  isAbilityKind,
  isRooted,
  isSilenced,
  isStunned,
  attackSpeedMultiplier,
  moveSpeedMultiplier,
  type AbilityDef,
  type AbilityKind,
  type CharacterClass,
  type LobbyMode,
} from '@arena/shared';
import { ArenaState, Player } from './schema.js';
import { AvatarRoom } from './AvatarRoom.js';
import { regenMana, reviveFull, spendMana } from '../combat.js';
import { INSTANT_ONESHOT_MS } from '../animation.js';
import { ChatLog } from '../chat.js';
import { getPool } from '../db/database.js';
import { resolveClass, resolveName, resolveSkinId, type JoinOptions } from './util/identity.js';
import { applyGravity, clamp, stepMove } from './util/locomotion.js';
import { ArenaTuning } from './arena/tuning.js';
import { ArenaMatch } from './arena/match.js';
import { CombatSystem } from './arena/combat.js';
import { ProjectileSystem } from './arena/projectiles.js';
import { fetchProfile, persistProfileDelta, type MatchProfile } from './arena/profiles.js';
import type { ArenaContext, Displacement } from './arena/context.js';

/** Origin height for a cast's broadcast (matches the projectile spawn height). */
const PROJECTILE_Y = 1;

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
  protected override readonly halfLimit = ARENA_HALF_SIZE - PLAYER_RADIUS;

  // Arena-specific per-session state (the avatar maps live on AvatarRoom).
  private readonly cooldowns = new Map<string, Partial<Record<AbilityKind, number>>>();
  private readonly respawnAt = new Map<string, number>();
  /** Casts mid wind-up (castTimeMs > 0); the player is rooted until they resolve. */
  private readonly pendingCasts = new Map<string, PendingCast>();
  /** Current auto-attack target (a player session id) per attacker. */
  private readonly attackTargets = new Map<string, string>();
  /** Sim time (ms) each player's next auto-attack is ready. */
  private readonly attackReadyAt = new Map<string, number>();
  /** Forced motion (dash / knockback) that overrides locomotion until `until`. */
  private readonly displacements = new Map<string, Displacement>();
  /** Persisted-profile accumulators per session (kills/deaths/xp this match). */
  private readonly profiles = new Map<string, MatchProfile>();

  /** This match's procedural cover, generated from `state.layoutSeed` in onCreate.
   *  The authoritative collision set for movement and projectiles. */
  private obstacles: readonly ArenaObstacle[] = [];

  /** Live-tunable balance for this room (per-room copy of the shared canon). */
  private readonly tuning = new ArenaTuning();
  // Combat systems, wired up in `onCreate` once the state + context exist.
  private match!: ArenaMatch;
  private combat!: CombatSystem;
  private projectiles!: ProjectileSystem;

  protected override jumpForce(): number {
    return this.tuning.movement.jumpForce;
  }

  /** A manual move order cancels any auto-attack. */
  protected override onMoveOrder(sessionId: string): void {
    this.attackTargets.delete(sessionId);
  }

  override onCreate(options?: { mode?: LobbyMode }): void {
    this.setState(new ArenaState());

    // Pick a per-match seed and build this arena's procedural cover. The seed is
    // replicated so every client rebuilds the identical layout (obstacles +
    // props) — see `generateArenaLayout`. Done before `buildSystems` so the
    // combat/projectile context captures this match's obstacles.
    const seed = (1 + Math.floor(Math.random() * 0xfffffffe)) >>> 0;
    this.state.layoutSeed = seed;
    this.obstacles = generateArenaLayout(seed).obstacles;

    this.buildSystems();

    // A matchmade team game (1v1…5v5): cap at the mode's total size, scale the
    // win target by team size, and hide from public join (only reserved seats
    // get in). Without a mode this is the public free-for-all arena (portal).
    if (isLobbyMode(options?.mode)) {
      this.maxClients = 2 * teamSizeForMode(options.mode);
      this.setPrivate(true);
      this.match.configureRanked(options.mode);
    }

    // Movement / jump / chat / emote / set-name come from AvatarRoom.
    this.registerAvatarHandlers();

    this.onMessage<{ targetId: string }>(ClientMessage.Attack, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const targetId = String(message?.targetId ?? '');
      const target = this.state.players.get(targetId);
      if (!target || targetId === client.sessionId || !target.alive) return;
      // Attack-move toward the target; clear any plain move destination.
      this.attackTargets.set(client.sessionId, targetId);
      this.destinations.delete(client.sessionId);
    });

    this.onMessage<ClientMessagePayloads[ClientMessage.CastAbility]>(
      ClientMessage.CastAbility,
      (client, message) => this.handleCast(client.sessionId, message),
    );

    this.onMessage(ClientMessage.DevTune, (_client, message: Record<string, unknown>) =>
      this.tuning.tuneMovement(message),
    );
    this.onMessage(
      ClientMessage.AbilityTune,
      (_client, message: ClientMessagePayloads[ClientMessage.AbilityTune]) =>
        this.tuning.tuneAbilities(message),
    );
    this.onMessage(
      ClientMessage.StatTune,
      (_client, message: ClientMessagePayloads[ClientMessage.StatTune]) =>
        this.tuning.tuneStats(message),
    );

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS);
  }

  /** Build the shared context and wire the combat / projectile / match systems.
   *  Called once after `setState`, so the systems share the room's live maps. */
  private buildSystems(): void {
    const ctx: ArenaContext = {
      state: this.state,
      tuning: this.tuning,
      obstacles: this.obstacles,
      now: () => this.simTime,
      broadcast: (type, message) => this.broadcast(type, message),
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
    };
    this.match = new ArenaMatch(ctx);
    this.combat = new CombatSystem(ctx, this.match);
    this.projectiles = new ProjectileSystem(ctx, this.combat);
    this.combat.attachProjectiles(this.projectiles);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const claims = this.enforceSingleSession(client, options);

    const player = new Player();
    player.sessionId = client.sessionId;
    player.name = resolveName(claims, options);
    player.characterClass = resolveClass(options);
    player.skinId = resolveSkinId(options);
    // Team comes from the matchmaking seat reservation; public arena joins
    // (portal) carry none and default to blue.
    player.team = isTeam(options?.team) ? options.team : 'blue';
    this.resetPlayer(player);

    this.state.players.set(client.sessionId, player);
    this.verticalVelocity.set(client.sessionId, 0);
    this.grounded.set(client.sessionId, true);
    this.cooldowns.set(client.sessionId, {});

    this.sendWelcome(client);

    // Load persisted progression for this account + class (async; sets the
    // replicated `level` and starts a stats accumulator). No-op without a valid
    // token or a database.
    void this.loadProfile(client.sessionId, claims?.pid, player.characterClass);
  }

  /** Load this account's class progression (identity comes from the token). */
  private async loadProfile(
    sessionId: string,
    playerId: number | undefined,
    characterClass: string,
  ): Promise<void> {
    const db = getPool();
    if (!db || playerId === undefined) return;
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
      console.error('[arena] failed to load profile:', err);
    }
  }

  protected override removeClient(client: Client): void {
    // Persist progression first — `flushProfile` reads the replicated player,
    // which `baseRemove` then deletes.
    this.flushProfile(client.sessionId);
    this.baseRemove(client.sessionId);
    this.cooldowns.delete(client.sessionId);
    this.respawnAt.delete(client.sessionId);
    this.pendingCasts.delete(client.sessionId);
    this.attackTargets.delete(client.sessionId);
    this.attackReadyAt.delete(client.sessionId);
    this.displacements.delete(client.sessionId);
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

  // --- Ability input -----------------------------------------------------

  private handleCast(
    sessionId: string,
    message: ClientMessagePayloads[ClientMessage.CastAbility],
  ): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive || !isAbilityKind(message?.ability)) return;

    // Crowd control: a stun blocks everything; a silence blocks casting.
    if (isStunned(player) || isSilenced(player)) return;

    const ability = message.ability;
    const config = this.tuning.abilityFor(player.characterClass, ability);
    const cd = this.cooldowns.get(sessionId);
    if (!cd) return;

    // Cooldown + mana gates, plus: can't start a cast while already casting.
    if ((cd[ability] ?? 0) > this.simTime) return;
    if (player.mana < config.manaCost) return;
    if (this.pendingCasts.has(sessionId)) return;

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
      const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
      let ox = (message.tx as number) - player.x;
      let oz = (message.tz as number) - player.z;
      const d = Math.hypot(ox, oz);
      if (d > config.range && d > 1e-3) {
        ox = (ox / d) * config.range;
        oz = (oz / d) * config.range;
      }
      targetX = clamp(player.x + ox, -limit, limit);
      targetZ = clamp(player.z + oz, -limit, limit);
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
    spendMana(player, config.manaCost);
    cd[ability] = this.simTime + config.cooldownMs;
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

    if (config.castTimeMs > 0) {
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
      this.combat.resolveCast(player, config, dirX, dirZ, targetX, targetZ, unitTargetId);
    }
  }

  /**
   * Auto-attack tick: face the target, chase it into range, then strike on the
   * class's attack-speed timer (a projectile for ranged classes, a direct hit
   * for melee). Clears the order if the target is gone or dead.
   */
  private updateAutoAttack(attacker: Player, sessionId: string, dt: number): void {
    const targetId = this.attackTargets.get(sessionId);
    const target = targetId ? this.state.players.get(targetId) : undefined;
    if (!target || !target.alive) {
      this.attackTargets.delete(sessionId);
      return;
    }

    const cfg = AUTO_ATTACKS[attacker.characterClass as CharacterClass];
    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    const dist = Math.hypot(dx, dz);
    const ndx = dist > 1e-3 ? dx / dist : 0;
    const ndz = dist > 1e-3 ? dz / dist : 0;
    if (dist > 1e-3) attacker.rotation = Math.atan2(ndx, ndz);

    if (dist > cfg.range) {
      // Chase: walk toward the target, stopping right at attack range (slows/
      // hastes scale the chase speed, same as locomotion).
      const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
      const speed =
        this.tuning.walkSpeedFor(attacker.characterClass) * moveSpeedMultiplier(attacker);
      const step = Math.min(speed * dt, dist - cfg.range + 0.01);
      attacker.x = clamp(attacker.x + ndx * step, -limit, limit);
      attacker.z = clamp(attacker.z + ndz * step, -limit, limit);
      return;
    }

    // In range: strike when the attack timer is ready (attack-speed buffs shorten
    // the interval).
    if (this.simTime < (this.attackReadyAt.get(sessionId) ?? 0)) return;
    this.attackReadyAt.set(
      sessionId,
      this.simTime + cfg.cooldownMs / attackSpeedMultiplier(attacker),
    );
    this.animOneShots.set(sessionId, {
      name: 'attack',
      until: this.simTime + Math.min(cfg.cooldownMs, 400),
    });
    if (cfg.kind === 'ranged') {
      this.projectiles.spawnAutoProjectile(attacker, ndx, ndz, cfg);
    } else {
      this.combat.dealDamage(target, cfg.damage, sessionId);
    }
  }

  // --- Simulation --------------------------------------------------------

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
    // Once a winner is decided, freeze the world — players hold their final pose
    // under the results overlay until they leave (or the room auto-disposes).
    if (this.match.matchOver) return;
    const dt = deltaMs / 1000;
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;

    this.state.players.forEach((player, sessionId) => {
      if (!player.alive) {
        player.animState = 'die';
        player.attackTargetId = '';
        this.pendingCasts.delete(sessionId);
        this.animOneShots.delete(sessionId);
        this.attackTargets.delete(sessionId);
        this.displacements.delete(sessionId);
        if (player.statuses.length > 0) player.statuses.clear();
        player.shield = 0;
        const respawn = this.respawnAt.get(sessionId);
        if (respawn !== undefined && this.simTime >= respawn) {
          this.resetPlayer(player);
          this.verticalVelocity.set(sessionId, 0);
          this.grounded.set(sessionId, true);
          this.respawnAt.delete(sessionId);
        }
        return;
      }

      regenMana(player, MANA_REGEN, dt);
      // Crowd control / buffs / dot-hot: prune, tick, and expire shields.
      this.combat.updateStatuses(player);

      // Capture pre-move position to derive locomotion (run vs idle) below.
      const startX = player.x;
      const startZ = player.z;

      const m = this.tuning.movement;

      // Forced displacement (dash / knockback) overrides locomotion while active.
      const disp = this.displacements.get(sessionId);
      const displacing = !!disp && this.simTime < disp.until;
      if (disp && !displacing) this.displacements.delete(sessionId);

      // Resolve a finished wind-up before this tick's movement decision.
      const pending = this.pendingCasts.get(sessionId);
      if (pending && this.simTime >= pending.resolveAt) {
        this.combat.resolveCast(
          player,
          pending.config,
          pending.dirX,
          pending.dirZ,
          pending.targetX,
          pending.targetZ,
          pending.unitTargetId,
        );
        this.pendingCasts.delete(sessionId);
      }

      if (displacing && disp) {
        // Slide along the displacement velocity (clamped to the arena).
        player.x = clamp(player.x + disp.vx * dt, -limit, limit);
        player.z = clamp(player.z + disp.vz * dt, -limit, limit);
      } else if (pending) {
        // Rooted wind-up: no movement while casting.
      } else if (isStunned(player) || isRooted(player)) {
        // Hard CC: no movement. A stun also drops the move order and auto-attack.
        this.destinations.delete(sessionId);
        if (isStunned(player)) this.attackTargets.delete(sessionId);
      } else if (this.attackTargets.has(sessionId)) {
        // Auto-attack: chase the target into range, then strike on a timer.
        this.updateAutoAttack(player, sessionId, dt);
      } else {
        // Point-and-click movement: the shared deterministic step (also run by
        // the client predictor) walks toward the destination and slides around
        // obstacles, so client and server stay in lockstep. Slows/hastes scale
        // the walk speed.
        const arrived = stepMove(
          player,
          this.destinations.get(sessionId) ?? null,
          {
            speed: this.tuning.walkSpeedFor(player.characterClass) * moveSpeedMultiplier(player),
            rotationSpeed: m.rotationSpeed,
            stoppingDistance: m.stoppingDistance,
            halfBounds: limit,
            obstacles: this.obstacles,
          },
          dt,
        );
        if (arrived) this.destinations.delete(sessionId);
      }

      // Resolve obstacle collisions for the non-move paths (auto-attack chase,
      // idle overlaps); stepMove already resolved the move path.
      const fixed = collideObstacles(player.x, player.z, this.obstacles, PLAYER_RADIUS);
      player.x = fixed.x;
      player.z = fixed.z;

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

    this.projectiles.update(dt);
    this.state.tick++;
  }

  /** Reset a player to a full, alive state at one of the layout's spawn points
   *  (a small random jitter avoids stacking when several share a point). */
  private resetPlayer(player: Player): void {
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
    // Spawn on this player's side of the arena (blue at +Z, red at −Z).
    const spawns = arenaSpawnsForTeam(player.team === 'red' ? 'red' : 'blue');
    const spawn = spawns[Math.floor(Math.random() * spawns.length)];
    const jitter = () => (Math.random() * 2 - 1) * 1.5;
    if (spawn) {
      player.x = clamp(spawn.x + jitter(), -limit, limit);
      player.z = clamp(spawn.z + jitter(), -limit, limit);
    } else {
      const range = ARENA_HALF_SIZE - PLAYER_RADIUS * 2;
      player.x = (Math.random() * 2 - 1) * range;
      player.z = (Math.random() * 2 - 1) * range;
    }
    player.y = GROUND_Y;
    const stats = this.tuning.classStats[player.characterClass as CharacterClass];
    player.maxHp = stats.health;
    player.maxMana = stats.mana;
    player.shield = 0;
    if (player.statuses.length > 0) player.statuses.clear();
    this.displacements.delete(player.sessionId);
    reviveFull(player);
  }
}
