import { Room, type Client } from '@colyseus/core';
import {
  ABILITIES,
  ABILITY_FIELD_META,
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  arenaSpawnsForTeam,
  isLobbyMode,
  isTeam,
  teamKillTargetFor,
  teamSizeForMode,
  stepLocomotion,
  AUTO_ATTACKS,
  CLASS_ABILITY_OVERRIDES,
  CLASS_DEFINITIONS,
  CLASS_STAT_FIELD_META,
  collideArenaObstacles,
  GRAVITY,
  GROUND_Y,
  EMOTE_MS,
  MANA_REGEN,
  MATCH_KILL_TARGET,
  MATCH_RESULT_LINGER_MS,
  MAX_PLAYERS,
  MOVEMENT,
  MOVEMENT_FIELD_META,
  PLAYER_RADIUS,
  PROJECTILE_LIFETIME_MS,
  RESPAWN_DELAY_MS,
  TICK_MS,
  XP_PER_KILL,
  ClientMessage,
  type ClientMessagePayloads,
  ServerMessage,
  isAbilityKind,
  isCharacterClass,
  isEmote,
  isRooted,
  isSilenced,
  isStunned,
  attackSpeedMultiplier,
  damageTakenMultiplier,
  moveSpeedMultiplier,
  levelForXp,
  type AbilityConfig,
  type AbilityDef,
  type AbilityKind,
  type AutoAttackConfig,
  type CharacterClass,
  type ClassStats,
  type FieldMeta,
  type LeafEffect,
  type LobbyMode,
  type MovementConfig,
  type StatusSpec,
  type Team,
} from '@arena/shared';
import { ArenaState, Player, Projectile, StatusEffect } from './schema.js';
import { runCast, type CastContext, type EffectRuntime } from '../abilities/executor.js';
import { applyDamage, applyHeal, regenMana, reviveFull, spendMana } from '../combat.js';
import {
  computeAnimState,
  HIT_ONESHOT_MS,
  INSTANT_ONESHOT_MS,
  type AnimOneShot,
} from '../animation.js';
import { ChatLog } from '../chat.js';
import { getPool } from '../db/database.js';
import { getProgress, recordResult } from '../db/players.js';
import { verifyToken } from '../auth.js';
import {
  evictRoomDuplicates,
  registerSession,
  tagClientAccount,
  unregisterSession,
  SESSION_SUPERSEDED,
} from '../sessions.js';

/** A player's persisted totals at join time. Live totals are tracked on the
 *  replicated `Player`; the delta (live − base) is flushed to the DB on leave. */
interface MatchProfile {
  playerId: number;
  characterClass: string;
  baseXp: number;
  baseKills: number;
  baseDeaths: number;
}

/** Maximum accepted display-name length. */
const MAX_NAME_LENGTH = 24;
/** Spawn height of a projectile above the ground. */
const PROJECTILE_Y = 1;

/** Server-only metadata for an in-flight projectile (not replicated). */
interface ProjectileMeta {
  ownerId: string;
  /** Source tag (ability kind or auto-attack vfx) — drives the client visual. */
  ability: string;
  dirX: number;
  dirZ: number;
  speed: number;
  range: number;
  radius: number;
  /** Direct damage for auto-attack projectiles (no `onHit`). */
  damage: number;
  /** Composable effects run against the player this projectile hits (ability
   *  projectiles); when present they supersede the flat `damage`. */
  onHit?: LeafEffect[];
  traveled: number;
  spawnedAt: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


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
 * on a fixed timestep (movement, gravity/jump, cast wind-ups, ability
 * projectiles, damage, respawn) and replicates the result via schema sync. All
 * gameplay is server-owned.
 */
export class ArenaRoom extends Room<ArenaState> {
  override maxClients = MAX_PLAYERS;

  /** Active move destination per session (cleared on arrival/death/cast). */
  private readonly destinations = new Map<string, { x: number; z: number }>();
  private readonly verticalVelocity = new Map<string, number>();
  private readonly grounded = new Map<string, boolean>();
  private readonly cooldowns = new Map<string, Partial<Record<AbilityKind, number>>>();
  private readonly respawnAt = new Map<string, number>();
  private readonly projectileMeta = new Map<string, ProjectileMeta>();
  /** Casts mid wind-up (castTimeMs > 0); the player is rooted until they resolve. */
  private readonly pendingCasts = new Map<string, PendingCast>();
  /** Transient one-shot animation (cast/attack/hit) currently asserted per player. */
  private readonly animOneShots = new Map<string, AnimOneShot>();
  private readonly chat = new ChatLog();
  /** Persisted-profile accumulators per session (kills/deaths/xp this match). */
  private readonly profiles = new Map<string, MatchProfile>();
  /** Current auto-attack target (a player session id) per attacker. */
  private readonly attackTargets = new Map<string, string>();
  /** Sim time (ms) each player's next auto-attack is ready. */
  private readonly attackReadyAt = new Map<string, number>();
  /** Forced motion (dash / knockback) that overrides locomotion until `until`. */
  private readonly displacements = new Map<
    string,
    { vx: number; vz: number; until: number }
  >();

  /** Accumulated simulation time in ms (used for cooldowns / respawn timers). */
  private simTime = 0;
  private projectileSeq = 0;

  /** A ranked match (from matchmaking): tracks a team kill target and ends
   *  decisively. False for the public free-for-all arena (portal travel). */
  private ranked = false;
  /** Combined kills a team must reach to win (set per mode in onCreate). */
  private teamKillTarget = MATCH_KILL_TARGET;
  /** Latched once a winner is decided; freezes the sim for the results screen. */
  private matchOver = false;
  /** Win/loss verdict per session, recorded to the DB when each player leaves. */
  private readonly outcomes = new Map<string, 'win' | 'loss'>();

  /**
   * Authoritative balance for this room, seeded from the shared canonical values
   * and live-tunable via the dev tools (per-room copies so tuning one room never
   * leaks into another):
   *  - `movement`: global movement "feel" (per-class walk speed is `classStats`).
   *  - `classStats`: per-class HP / mana / move speed / attack.
   *  - `abilityBase`: the global ability defaults.
   *  - `classAbilityOverrides`: per-class deltas over the base.
   */
  private readonly movement: MovementConfig = structuredClone(MOVEMENT);
  private readonly classStats: Record<CharacterClass, ClassStats> = structuredClone(
    Object.fromEntries(
      (Object.keys(CLASS_DEFINITIONS) as CharacterClass[]).map((c) => [c, CLASS_DEFINITIONS[c].stats]),
    ),
  ) as Record<CharacterClass, ClassStats>;
  private readonly abilityBase: Record<AbilityKind, AbilityDef> = structuredClone(ABILITIES);
  private readonly classAbilityOverrides: Partial<
    Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>
  > = structuredClone(CLASS_ABILITY_OVERRIDES);

  /** The effective ability definition for a class = global base ⊕ that class's
   *  override (tuning only patches the flat numeric fields; `effects` carry over). */
  private abilityFor(characterClass: string, kind: AbilityKind): AbilityDef {
    const override = this.classAbilityOverrides[characterClass as CharacterClass]?.[kind];
    return override ? { ...this.abilityBase[kind], ...override } : this.abilityBase[kind];
  }

  /** Per-player walk speed (the class move-speed stat). Class is validated on
   *  join, so the fallback only guards against an unexpected/blank class. */
  private walkSpeedFor(characterClass: string): number {
    return this.classStats[characterClass as CharacterClass]?.moveSpeed ?? CLASS_DEFINITIONS.warrior.stats.moveSpeed;
  }

  /**
   * Merge a numeric override patch into a target, clamping each field to its
   * meta range and ignoring unknown/non-numeric fields — the single validation
   * path for every dev-tune message (ranges come from the shared field meta).
   */
  private mergeTuned(
    target: Record<string, number>,
    patch: Record<string, unknown> | undefined,
    meta: Partial<Record<string, FieldMeta>>,
  ): void {
    if (!patch || typeof patch !== 'object') return;
    for (const [field, value] of Object.entries(patch)) {
      const m = meta[field];
      if (m && typeof value === 'number' && Number.isFinite(value)) {
        target[field] = clamp(value, m.min, m.max);
      }
    }
  }

  override onCreate(options?: { mode?: LobbyMode }): void {
    // A matchmade team game (1v1…5v5): cap at the mode's total size, scale the
    // win target by team size, and hide from public join (only reserved seats
    // get in). Without a mode this is the public free-for-all arena (portal).
    if (isLobbyMode(options?.mode)) {
      this.ranked = true;
      this.maxClients = 2 * teamSizeForMode(options.mode);
      this.teamKillTarget = teamKillTargetFor(options.mode);
      this.setPrivate(true);
    }
    this.setState(new ArenaState());

    this.onMessage<{ x: number; z: number }>(ClientMessage.MoveTo, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
      const x = Number.isFinite(message?.x) ? clamp(message.x, -limit, limit) : player.x;
      const z = Number.isFinite(message?.z) ? clamp(message.z, -limit, limit) : player.z;
      // A manual move order cancels any auto-attack.
      this.attackTargets.delete(client.sessionId);
      this.destinations.set(client.sessionId, { x, z });
    });

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

    this.onMessage(ClientMessage.Jump, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      if (this.grounded.get(client.sessionId)) {
        this.verticalVelocity.set(client.sessionId, this.movement.jumpForce);
        this.grounded.set(client.sessionId, false);
      }
    });

    this.onMessage<{ emote: string }>(ClientMessage.Emote, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive || !isEmote(message?.emote)) return;
      this.animOneShots.set(client.sessionId, {
        name: message.emote,
        until: this.simTime + EMOTE_MS,
      });
    });

    this.onMessage<ClientMessagePayloads[ClientMessage.CastAbility]>(
      ClientMessage.CastAbility,
      (client, message) => this.handleCast(client.sessionId, message),
    );

    this.onMessage<{ name: string }>(ClientMessage.SetName, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const name = String(message?.name ?? '')
        .trim()
        .slice(0, MAX_NAME_LENGTH);
      if (name.length > 0) player.name = name;
    });

    this.onMessage(ClientMessage.DevTune, (_client, message: Record<string, unknown>) => {
      this.mergeTuned(this.movement as unknown as Record<string, number>, message, MOVEMENT_FIELD_META);
    });

    this.onMessage(ClientMessage.StopMove, (client) => {
      this.destinations.delete(client.sessionId);
    });

    this.onMessage<{ text: string }>(ClientMessage.Chat, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      this.chat.handle(this, client.sessionId, player?.name ?? 'Adventurer', message?.text);
    });

    this.onMessage(
      ClientMessage.AbilityTune,
      (_client, message: ClientMessagePayloads[ClientMessage.AbilityTune]) => {
        if (!message || typeof message !== 'object') return;
        // Global base patches.
        for (const [kind, overrides] of Object.entries(message.global ?? {})) {
          if (!isAbilityKind(kind)) continue;
          this.mergeTuned(
            this.abilityBase[kind] as unknown as Record<string, number>,
            overrides as Record<string, unknown>,
            ABILITY_FIELD_META,
          );
        }
        // Per-class delta patches.
        for (const [cls, byKind] of Object.entries(message.perClass ?? {})) {
          if (!isCharacterClass(cls) || !byKind) continue;
          const classOverrides = (this.classAbilityOverrides[cls] ??= {});
          for (const [kind, overrides] of Object.entries(byKind)) {
            if (!isAbilityKind(kind)) continue;
            const slot = (classOverrides[kind] ??= {});
            this.mergeTuned(slot as Record<string, number>, overrides as Record<string, unknown>, ABILITY_FIELD_META);
          }
        }
      },
    );

    this.onMessage(
      ClientMessage.StatTune,
      (_client, message: ClientMessagePayloads[ClientMessage.StatTune]) => {
        if (!message || typeof message !== 'object') return;
        for (const [cls, patch] of Object.entries(message)) {
          if (!isCharacterClass(cls)) continue;
          this.mergeTuned(
            this.classStats[cls] as unknown as Record<string, number>,
            patch as Record<string, unknown>,
            CLASS_STAT_FIELD_META,
          );
        }
      },
    );

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS);
  }

  override onJoin(
    client: Client,
    options?: {
      token?: string;
      name?: string;
      characterClass?: string;
      skinId?: string;
      team?: string;
      sessionKey?: string;
    },
  ): void {
    const claims = verifyToken(options?.token);
    // Single-session: a newer tab for this account supersedes the older one, and
    // a same-account reconnect into this room evicts its own stale ghost.
    if (claims?.pid !== undefined) {
      tagClientAccount(client, claims.pid);
      for (const stale of registerSession(claims.pid, String(options?.sessionKey ?? ''), client)) {
        stale.leave(SESSION_SUPERSEDED);
      }
      evictRoomDuplicates(this, claims.pid, client);
    }
    const player = new Player();
    player.sessionId = client.sessionId;
    player.name =
      claims?.name?.slice(0, MAX_NAME_LENGTH) ||
      (options?.name ?? '').trim().slice(0, MAX_NAME_LENGTH) ||
      'Adventurer';
    player.characterClass = isCharacterClass(options?.characterClass)
      ? options.characterClass
      : 'warrior';
    player.skinId = String(options?.skinId ?? '').slice(0, 64);
    // Team comes from the matchmaking seat reservation; public arena joins
    // (portal) carry none and default to blue.
    player.team = isTeam(options?.team) ? options.team : 'blue';
    this.resetPlayer(player);

    this.state.players.set(client.sessionId, player);
    this.verticalVelocity.set(client.sessionId, 0);
    this.grounded.set(client.sessionId, true);
    this.cooldowns.set(client.sessionId, {});

    client.send(ServerMessage.Welcome, {
      sessionId: client.sessionId,
      worldSeed: this.roomId.length,
    });
    this.chat.sendHistory(client);

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
      const progress = await getProgress(db, playerId, characterClass);
      this.profiles.set(sessionId, {
        playerId,
        characterClass,
        baseXp: progress.xp,
        baseKills: progress.kills,
        baseDeaths: progress.deaths,
      });
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

  override onLeave(client: Client): void {
    this.flushProfile(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.destinations.delete(client.sessionId);
    this.verticalVelocity.delete(client.sessionId);
    this.grounded.delete(client.sessionId);
    this.cooldowns.delete(client.sessionId);
    this.respawnAt.delete(client.sessionId);
    this.pendingCasts.delete(client.sessionId);
    this.animOneShots.delete(client.sessionId);
    this.attackTargets.delete(client.sessionId);
    this.attackReadyAt.delete(client.sessionId);
    this.outcomes.delete(client.sessionId);
    this.chat.forget(client.sessionId);
    unregisterSession(client);
  }

  /** Persist this session's progression delta (live totals − loaded base) on leave. */
  private flushProfile(sessionId: string): void {
    const profile = this.profiles.get(sessionId);
    this.profiles.delete(sessionId);
    const db = getPool();
    const player = this.state.players.get(sessionId);
    if (!db || !profile || !player) return;
    const outcome = this.outcomes.get(sessionId);
    const delta = {
      xp: player.xp - profile.baseXp,
      kills: player.kills - profile.baseKills,
      deaths: player.deaths - profile.baseDeaths,
      wins: outcome === 'win' ? 1 : 0,
      losses: outcome === 'loss' ? 1 : 0,
    };
    if (delta.xp <= 0 && delta.kills <= 0 && delta.deaths <= 0 && !delta.wins && !delta.losses) {
      return;
    }
    void recordResult(db, profile.playerId, profile.characterClass, delta).catch((err) =>
      console.error('[arena] failed to save profile:', err),
    );
  }

  // --- Abilities ---------------------------------------------------------

  private handleCast(
    sessionId: string,
    message: ClientMessagePayloads[ClientMessage.CastAbility],
  ): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive || !isAbilityKind(message?.ability)) return;

    // Crowd control: a stun blocks everything; a silence blocks casting.
    if (isStunned(player) || isSilenced(player)) return;

    const ability = message.ability;
    const config = this.abilityFor(player.characterClass, ability);
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
      if (t && t.alive && Math.hypot(t.x - player.x, t.z - player.z) <= config.range + PLAYER_RADIUS) {
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
      this.resolveCast(player, config, dirX, dirZ, targetX, targetZ, unitTargetId);
    }
  }

  /**
   * Apply an ability's effects via the data-driven executor (no per-ability
   * switch). Runs immediately for instant casts, or when a pending cast's
   * wind-up elapses.
   */
  private resolveCast(
    player: Player,
    config: AbilityDef,
    dirX: number,
    dirZ: number,
    targetX?: number,
    targetZ?: number,
    unitTargetId?: string,
  ): void {
    const unitTarget = unitTargetId ? this.state.players.get(unitTargetId) : undefined;
    const ctx: CastContext = { caster: player, dirX, dirZ, targetX, targetZ, unitTarget };
    runCast(config.effects, ctx, this.effectRuntime);
  }

  /** Invoke `fn` for every living enemy of `exceptId` within `radius` of (x, z).
   *  The single AoE target-selection used by the effect executor. */
  private forEachEnemyInRadius(
    x: number,
    z: number,
    radius: number,
    exceptId: string,
    fn: (target: Player) => void,
  ): void {
    const hitSq = (radius + PLAYER_RADIUS) * (radius + PLAYER_RADIUS);
    this.state.players.forEach((target, id) => {
      if (id === exceptId || !target.alive) return;
      const dx = target.x - x;
      const dz = target.z - z;
      if (dx * dx + dz * dz <= hitSq) fn(target);
    });
  }

  /** Spawn an ability projectile carrying its `onHit` effects (run by the
   *  executor against whoever it collides with). */
  private spawnProjectile(
    owner: Player,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    onHit: LeafEffect[],
  ): void {
    const id = `p${this.projectileSeq++}`;
    const projectile = new Projectile();
    projectile.id = id;
    projectile.ownerId = owner.sessionId;
    projectile.ability = vfx;
    // Start just in front of the caster so it doesn't immediately self-collide.
    projectile.x = owner.x + dirX * (PLAYER_RADIUS + 0.3);
    projectile.z = owner.z + dirZ * (PLAYER_RADIUS + 0.3);
    projectile.y = PROJECTILE_Y;
    this.state.projectiles.set(id, projectile);

    this.projectileMeta.set(id, {
      ownerId: owner.sessionId,
      ability: vfx,
      dirX,
      dirZ,
      speed,
      range,
      radius,
      damage: 0,
      onHit,
      traveled: 0,
      spawnedAt: this.simTime,
    });
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
      const speed = this.walkSpeedFor(attacker.characterClass) * moveSpeedMultiplier(attacker);
      const step = Math.min(speed * dt, dist - cfg.range + 0.01);
      attacker.x = clamp(attacker.x + ndx * step, -limit, limit);
      attacker.z = clamp(attacker.z + ndz * step, -limit, limit);
      return;
    }

    // In range: strike when the attack timer is ready (attack-speed buffs shorten
    // the interval).
    if (this.simTime < (this.attackReadyAt.get(sessionId) ?? 0)) return;
    this.attackReadyAt.set(sessionId, this.simTime + cfg.cooldownMs / attackSpeedMultiplier(attacker));
    this.animOneShots.set(sessionId, {
      name: 'attack',
      until: this.simTime + Math.min(cfg.cooldownMs, 400),
    });
    if (cfg.kind === 'ranged') {
      this.spawnAutoProjectile(attacker, ndx, ndz, cfg);
    } else {
      this.dealDamage(target, cfg.damage, sessionId);
    }
  }

  /** Spawn a basic-attack projectile (ranged auto-attacks). */
  private spawnAutoProjectile(
    owner: Player,
    dirX: number,
    dirZ: number,
    cfg: AutoAttackConfig,
  ): void {
    const id = `p${this.projectileSeq++}`;
    const projectile = new Projectile();
    projectile.id = id;
    projectile.ownerId = owner.sessionId;
    projectile.ability = cfg.projectileVfx ?? 'fireball';
    projectile.x = owner.x + dirX * (PLAYER_RADIUS + 0.3);
    projectile.z = owner.z + dirZ * (PLAYER_RADIUS + 0.3);
    projectile.y = PROJECTILE_Y;
    this.state.projectiles.set(id, projectile);

    this.projectileMeta.set(id, {
      ownerId: owner.sessionId,
      ability: projectile.ability,
      dirX,
      dirZ,
      speed: cfg.projectileSpeed ?? 20,
      range: cfg.range + 6,
      radius: cfg.projectileRadius ?? 0.5,
      damage: cfg.damage,
      traveled: 0,
      spawnedAt: this.simTime,
    });
  }

  /** Resolve a hit on a player: scale by vulnerability, drain any absorb shield,
   *  apply the remainder via the combat core, broadcast, and schedule respawn on
   *  a kill. */
  private dealDamage(target: Player, amount: number, fromId: string): void {
    if (!target.alive || amount <= 0) return;
    // Vulnerability (damage_amp) scales incoming damage; shields absorb first.
    let incoming = amount * damageTakenMultiplier(target);
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, incoming);
      target.shield -= absorbed;
      incoming -= absorbed;
      // Keep the shield status' lifetime in sync so it expires when emptied.
      if (target.shield <= 0) this.removeStatuses(target, 'shield');
    }
    if (incoming <= 0) return;

    const { applied, lethal } = applyDamage(target, incoming);
    if (applied <= 0) return;

    this.broadcast(ServerMessage.Damage, {
      from: fromId,
      to: target.sessionId,
      amount: applied,
      lethal,
    });

    if (lethal) {
      this.destinations.delete(target.sessionId);
      this.respawnAt.set(target.sessionId, this.simTime + RESPAWN_DELAY_MS);
      // Update live, replicated career totals (the HUD reads these; the DB delta
      // is flushed on leave). `fromId === target` is self-damage — no kill credit.
      const killer = fromId !== target.sessionId ? this.state.players.get(fromId) : undefined;
      if (killer) {
        const beforeLevel = killer.level;
        killer.kills += 1;
        killer.xp += XP_PER_KILL;
        killer.level = levelForXp(killer.xp);
        if (killer.level > beforeLevel) {
          this.broadcast(ServerMessage.LevelUp, {
            sessionId: killer.sessionId,
            level: killer.level,
          });
        }
      }
      target.deaths += 1;

      // Ranked match: the first team to the combined kill target wins.
      if (this.ranked && !this.matchOver && killer) {
        const team = killer.team === 'red' ? 'red' : 'blue';
        if (this.teamKills(team) >= this.teamKillTarget) this.endMatch(team);
      }
    } else {
      // Flinch — unless a cast/attack pose is already playing (don't cut it).
      const existing = this.animOneShots.get(target.sessionId);
      if (!existing || existing.until <= this.simTime) {
        this.animOneShots.set(target.sessionId, {
          name: 'hit',
          until: this.simTime + HIT_ONESHOT_MS,
        });
      }
    }
  }

  // --- Effect runtime (the executor's hooks into the world) --------------

  /** Heal a target and broadcast the healing feedback. */
  private healTarget(target: Player, amount: number): void {
    const healed = applyHeal(target, amount);
    if (healed > 0) this.broadcast(ServerMessage.Heal, { to: target.sessionId, amount: healed });
  }

  /** Grant (or refresh) an absorb shield. Last shield wins — simple and enough
   *  for the current kits; a stacking model can come later. */
  private addShield(target: Player, amount: number, durationMs: number, fromId: string): void {
    if (amount <= 0 || !target.alive) return;
    this.removeStatuses(target, 'shield');
    target.shield = amount;
    this.applyStatus(target, { kind: 'shield', durationMs, magnitude: amount }, fromId);
  }

  /** Apply (or refresh) a status on a target. A new status of the same kind
   *  replaces the old one (re-applying refreshes its duration). */
  private applyStatus(target: Player, spec: StatusSpec, fromId: string): void {
    if (!target.alive || spec.durationMs <= 0) return;
    this.removeStatuses(target, spec.kind);
    const s = new StatusEffect();
    s.kind = spec.kind;
    s.expiresAt = this.simTime + spec.durationMs;
    s.magnitude = spec.magnitude ?? 0;
    s.tickMs = spec.tickMs ?? 0;
    s.tickAmount = spec.tickAmount ?? 0;
    s.nextTickAt = spec.tickMs ? this.simTime + spec.tickMs : 0;
    s.sourceId = fromId;
    target.statuses.push(s);
    // A stun/root cancels in-progress movement so it reads as a hard stop.
    if (spec.kind === 'stun' || spec.kind === 'root') this.destinations.delete(target.sessionId);
    if (spec.kind === 'stun') this.attackTargets.delete(target.sessionId);
  }

  /** Drop every active status of `kind` from a target. */
  private removeStatuses(target: Player, kind: StatusEffect['kind']): void {
    for (let i = target.statuses.length - 1; i >= 0; i--) {
      if (target.statuses[i]?.kind === kind) target.statuses.splice(i, 1);
    }
  }

  /** Begin a forced displacement (dash / knockback): a constant-velocity slide
   *  for `distance / speed` seconds that overrides locomotion while active. */
  private displace(entity: Player, dirX: number, dirZ: number, distance: number, speed: number): void {
    if (speed <= 0 || distance <= 0) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.displacements.set(entity.sessionId, {
      vx: (dirX / len) * speed,
      vz: (dirZ / len) * speed,
      until: this.simTime + (distance / speed) * 1000,
    });
    // A displacement overrides a pending move order.
    this.destinations.delete(entity.sessionId);
  }

  /** Per-tick status processing: prune expired statuses, tick dot/hot, and clear
   *  an emptied shield. Runs once per living player each tick. */
  private updateStatuses(player: Player): void {
    const list = player.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s) continue;
      if (this.simTime >= s.expiresAt) {
        if (s.kind === 'shield') player.shield = 0;
        list.splice(i, 1);
        continue;
      }
      if ((s.kind === 'dot' || s.kind === 'hot') && s.tickMs > 0 && this.simTime >= s.nextTickAt) {
        if (s.kind === 'dot') this.dealDamage(player, s.tickAmount, s.sourceId);
        else this.healTarget(player, s.tickAmount);
        s.nextTickAt += s.tickMs;
      }
    }
  }

  /** The executor's view of the world — every ability side effect funnels
   *  through these hooks (declared once; abilities never touch this). */
  private readonly effectRuntime: EffectRuntime = {
    dealDamage: (t, a, f) => this.dealDamage(t, a, f),
    heal: (t, a) => this.healTarget(t, a),
    addShield: (t, a, d, f) => this.addShield(t, a, d, f),
    applyStatus: (t, s, f) => this.applyStatus(t, s, f),
    displace: (e, dx, dz, dist, sp) => this.displace(e, dx, dz, dist, sp),
    spawnProjectile: (o, v, dx, dz, sp, r, rad, oh) =>
      this.spawnProjectile(o, v, dx, dz, sp, r, rad, oh),
    forEachEnemyInRadius: (x, z, r, ex, fn) => this.forEachEnemyInRadius(x, z, r, ex, fn),
  };

  /** Combined live kills for a team (the team-aggregate win metric). */
  private teamKills(team: Team): number {
    let total = 0;
    this.state.players.forEach((player) => {
      if (player.team === team) total += player.kills;
    });
    return total;
  }

  /** Decide a ranked match: record each player's verdict by team, broadcast the
   *  final scoreboard, and freeze the sim so clients can show the results screen. */
  private endMatch(winnerTeam: Team): void {
    this.matchOver = true;
    const scores: { id: string; name: string; team: Team; kills: number; deaths: number }[] = [];
    this.state.players.forEach((player, sessionId) => {
      const team = player.team === 'red' ? 'red' : 'blue';
      this.outcomes.set(sessionId, team === winnerTeam ? 'win' : 'loss');
      scores.push({ id: sessionId, name: player.name, team, kills: player.kills, deaths: player.deaths });
    });
    this.broadcast(ServerMessage.MatchOver, {
      winnerTeam,
      target: this.teamKillTarget,
      scores,
    });
    // Clients return to town on their own; dispose as a backstop if they linger.
    this.clock.setTimeout(() => this.disconnect(), MATCH_RESULT_LINGER_MS);
  }

  // --- Simulation --------------------------------------------------------

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
    // Once a winner is decided, freeze the world — players hold their final pose
    // under the results overlay until they leave (or the room auto-disposes).
    if (this.matchOver) return;
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
      this.updateStatuses(player);

      // Capture pre-move position to derive locomotion (run vs idle) below.
      const startX = player.x;
      const startZ = player.z;

      const m = this.movement;

      // Forced displacement (dash / knockback) overrides locomotion while active.
      const disp = this.displacements.get(sessionId);
      const displacing = !!disp && this.simTime < disp.until;
      if (disp && !displacing) this.displacements.delete(sessionId);

      // Resolve a finished wind-up before this tick's movement decision.
      const pending = this.pendingCasts.get(sessionId);
      if (pending && this.simTime >= pending.resolveAt) {
        this.resolveCast(
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
        const result = stepLocomotion(
          { x: player.x, z: player.z, rotation: player.rotation },
          this.destinations.get(sessionId) ?? null,
          {
            speed: this.walkSpeedFor(player.characterClass) * moveSpeedMultiplier(player),
            rotationSpeed: m.rotationSpeed,
            stoppingDistance: m.stoppingDistance,
            halfBounds: limit,
            obstacles: ARENA_OBSTACLES,
          },
          dt,
        );
        player.x = result.x;
        player.z = result.z;
        player.rotation = result.rotation;
        if (result.arrived) this.destinations.delete(sessionId);
      }

      // Resolve obstacle collisions for the non-move paths (auto-attack chase,
      // idle overlaps); stepLocomotion already resolved the move path.
      const fixed = collideArenaObstacles(player.x, player.z);
      player.x = fixed.x;
      player.z = fixed.z;

      // Vertical movement (gravity + jump impulse set by the Jump message).
      let vy = this.verticalVelocity.get(sessionId) ?? 0;
      vy -= GRAVITY * dt;
      player.y += vy * dt;
      if (player.y <= GROUND_Y) {
        player.y = GROUND_Y;
        vy = 0;
        this.grounded.set(sessionId, true);
      }
      this.verticalVelocity.set(sessionId, vy);

      // Authoritative animation: one-shots over locomotion (Run while moving).
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
      // Moving cancels a dance (but not a combat pose like cast/attack).
      const active = this.animOneShots.get(sessionId);
      if (active && moving && isEmote(active.name)) this.animOneShots.delete(sessionId);
      player.animState = computeAnimState({
        alive: true,
        moving,
        oneShot: this.animOneShots.get(sessionId) ?? null,
        now: this.simTime,
      });
      // Mirror the auto-attack target into replicated state for the attack banner.
      player.attackTargetId = this.attackTargets.get(sessionId) ?? '';
    });

    this.updateProjectiles(dt);
    this.state.tick++;
  }

  private updateProjectiles(dt: number): void {
    const expired: string[] = [];

    this.state.projectiles.forEach((projectile, id) => {
      const meta = this.projectileMeta.get(id);
      if (!meta) {
        expired.push(id);
        return;
      }

      const step = meta.speed * dt;
      projectile.x += meta.dirX * step;
      projectile.z += meta.dirZ * step;
      meta.traveled += step;

      if (meta.traveled >= meta.range || this.simTime - meta.spawnedAt > PROJECTILE_LIFETIME_MS) {
        expired.push(id);
        return;
      }

      // Obstacles block projectiles (cover).
      for (const o of ARENA_OBSTACLES) {
        const dx = projectile.x - o.x;
        const dz = projectile.z - o.z;
        const r = o.radius + meta.radius;
        if (dx * dx + dz * dz <= r * r) {
          expired.push(id);
          return;
        }
      }

      // Collide with the first eligible player (MapSchema isn't a standard
      // iterable, so use forEach and capture the first hit).
      const hitRadiusSq = (meta.radius + PLAYER_RADIUS) * (meta.radius + PLAYER_RADIUS);
      let hitId: string | null = null;
      this.state.players.forEach((target, targetId) => {
        if (hitId || targetId === meta.ownerId || !target.alive) return;
        const dx = target.x - projectile.x;
        const dz = target.z - projectile.z;
        if (dx * dx + dz * dz <= hitRadiusSq) hitId = targetId;
      });
      if (hitId) {
        const target = this.state.players.get(hitId);
        const owner = this.state.players.get(meta.ownerId);
        if (target) {
          if (meta.onHit && owner) {
            // Ability projectile: run its composable on-hit effects (damage +
            // any status/knockback) against the player it struck.
            runCast(
              meta.onHit,
              { caster: owner, dirX: meta.dirX, dirZ: meta.dirZ, unitTarget: target },
              this.effectRuntime,
            );
          } else {
            // Auto-attack projectile: a plain direct hit.
            this.dealDamage(target, meta.damage, meta.ownerId);
          }
        }
        expired.push(id);
      }
    });

    for (const id of expired) {
      this.state.projectiles.delete(id);
      this.projectileMeta.delete(id);
    }
  }

  // --- Helpers -----------------------------------------------------------

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
    const stats = this.classStats[player.characterClass as CharacterClass];
    player.maxHp = stats.health;
    player.maxMana = stats.mana;
    player.shield = 0;
    if (player.statuses.length > 0) player.statuses.clear();
    this.displacements.delete(player.sessionId);
    reviveFull(player);
  }
}
