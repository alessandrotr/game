import { Room, type Client } from '@colyseus/core';
import {
  ABILITIES,
  ABILITY_FIELD_META,
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  ARENA_SPAWN_POINTS,
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
  levelForXp,
  type AbilityConfig,
  type AbilityKind,
  type AutoAttackConfig,
  type CharacterClass,
  type ClassStats,
  type FieldMeta,
  type MovementConfig,
} from '@arena/shared';
import { ArenaState, Player, Projectile } from './schema.js';
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
  damage: number;
  traveled: number;
  spawnedAt: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/** A cast in its wind-up: the effect resolves at `resolveAt` (sim time, ms). */
interface PendingCast {
  ability: AbilityKind;
  config: AbilityConfig;
  dirX: number;
  dirZ: number;
  /** Ground-target impact point (ground-targeted abilities only). */
  targetX?: number;
  targetZ?: number;
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

  /**
   * Active move destination per session (cleared on arrival/death/cast).
   * `sprint` is decided when the destination is set and held constant for the
   * whole trip, so the player doesn't downshift to walk as it nears the mark.
   */
  private readonly destinations = new Map<string, { x: number; z: number; sprint: boolean }>();
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

  /** Accumulated simulation time in ms (used for cooldowns / respawn timers). */
  private simTime = 0;
  private projectileSeq = 0;

  /** A ranked 1v1 (from matchmaking): tracks a kill target and ends decisively. */
  private ranked = false;
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
  private readonly abilityBase: Record<AbilityKind, AbilityConfig> = structuredClone(ABILITIES);
  private readonly classAbilityOverrides: Partial<
    Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>
  > = structuredClone(CLASS_ABILITY_OVERRIDES);

  /** The effective ability config for a class = global base ⊕ that class's override. */
  private abilityFor(characterClass: string, kind: AbilityKind): AbilityConfig {
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

  override onCreate(options?: { match?: boolean }): void {
    // A matchmade 1v1: cap at two players and hide from public join (only the
    // two reserved seats get in).
    if (options?.match) {
      this.ranked = true;
      this.maxClients = 2;
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
      // Lock sprint-vs-walk based on the distance at issue time.
      const sprint = Math.hypot(x - player.x, z - player.z) > this.movement.sprintThreshold;
      this.destinations.set(client.sessionId, { x, z, sprint });
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

    this.onMessage<{ ability: AbilityKind; dirX: number; dirZ: number; tx?: number; tz?: number }>(
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
    options?: { token?: string; name?: string; characterClass?: string; skinId?: string },
  ): void {
    const claims = verifyToken(options?.token);
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
    message: { ability: AbilityKind; dirX: number; dirZ: number; tx?: number; tz?: number },
  ): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive || !isAbilityKind(message?.ability)) return;

    const ability = message.ability;
    const config = this.abilityFor(player.characterClass, ability);
    const cd = this.cooldowns.get(sessionId);
    if (!cd) return;

    // Cooldown + mana gates, plus: can't start a cast while already casting.
    if ((cd[ability] ?? 0) > this.simTime) return;
    if (player.mana < config.manaCost) return;
    if (this.pendingCasts.has(sessionId)) return;

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
    });

    // Assert the authoritative cast/attack pose for the wind-up (or a brief
    // window for instant abilities). `shockwave` reads as a physical swing.
    this.animOneShots.set(sessionId, {
      name: ability === 'shockwave' ? 'attack' : 'cast',
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
        resolveAt: this.simTime + config.castTimeMs,
      });
    } else {
      this.resolveCast(player, ability, config, dirX, dirZ, targetX, targetZ);
    }
  }

  /** Apply an ability's effect. Runs immediately for instant casts, or when a
   *  pending cast's wind-up elapses. */
  private resolveCast(
    player: Player,
    ability: AbilityKind,
    config: AbilityConfig,
    dirX: number,
    dirZ: number,
    targetX?: number,
    targetZ?: number,
  ): void {
    switch (ability) {
      case 'fireball':
      case 'arcane_bolt':
        this.spawnProjectile(player, ability, config, dirX, dirZ);
        break;
      case 'heal': {
        const healed = applyHeal(player, config.healAmount ?? 0);
        if (healed > 0) {
          this.broadcast(ServerMessage.Heal, { to: player.sessionId, amount: healed });
        }
        break;
      }
      case 'frost_nova':
      case 'shockwave':
        // Point-blank burst around the caster.
        this.applyAoeDamage(player.x, player.z, config.aoeRadius ?? 4, config.damage, player.sessionId);
        break;
      case 'arcane_blast': {
        // Burst at the clicked point (falls back to a point ahead if untargeted).
        const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
        const ix = targetX ?? clamp(player.x + dirX * config.range, -limit, limit);
        const iz = targetZ ?? clamp(player.z + dirZ * config.range, -limit, limit);
        this.applyAoeDamage(ix, iz, config.aoeRadius ?? 3, config.damage, player.sessionId);
        break;
      }
    }
  }

  /** Damage every living player (except `exceptId`) within `radius` of (x, z). */
  private applyAoeDamage(
    x: number,
    z: number,
    radius: number,
    damage: number,
    exceptId: string,
  ): void {
    if (damage <= 0) return;
    const hitSq = (radius + PLAYER_RADIUS) * (radius + PLAYER_RADIUS);
    this.state.players.forEach((target, id) => {
      if (id === exceptId || !target.alive) return;
      const dx = target.x - x;
      const dz = target.z - z;
      if (dx * dx + dz * dz <= hitSq) this.dealDamage(target, damage, exceptId);
    });
  }

  private spawnProjectile(
    owner: Player,
    ability: AbilityKind,
    config: (typeof ABILITIES)[AbilityKind],
    dirX: number,
    dirZ: number,
  ): void {
    const id = `p${this.projectileSeq++}`;
    const projectile = new Projectile();
    projectile.id = id;
    projectile.ownerId = owner.sessionId;
    projectile.ability = ability;
    // Start just in front of the caster so it doesn't immediately self-collide.
    projectile.x = owner.x + dirX * (PLAYER_RADIUS + 0.3);
    projectile.z = owner.z + dirZ * (PLAYER_RADIUS + 0.3);
    projectile.y = PROJECTILE_Y;
    this.state.projectiles.set(id, projectile);

    this.projectileMeta.set(id, {
      ownerId: owner.sessionId,
      ability,
      dirX,
      dirZ,
      speed: config.projectileSpeed ?? 15,
      range: config.projectileRange ?? 25,
      radius: config.projectileRadius ?? 0.6,
      damage: config.damage,
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
      // Chase: walk toward the target, stopping right at attack range.
      const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
      const step = Math.min(this.walkSpeedFor(attacker.characterClass) * dt, dist - cfg.range + 0.01);
      attacker.x = clamp(attacker.x + ndx * step, -limit, limit);
      attacker.z = clamp(attacker.z + ndz * step, -limit, limit);
      return;
    }

    // In range: strike when the attack timer is ready.
    if (this.simTime < (this.attackReadyAt.get(sessionId) ?? 0)) return;
    this.attackReadyAt.set(sessionId, this.simTime + cfg.cooldownMs);
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

  /** Resolve a hit on a player: apply the damage via the combat core, broadcast
   *  the result, and schedule respawn on a kill. */
  private dealDamage(target: Player, amount: number, fromId: string): void {
    const { applied, lethal } = applyDamage(target, amount);
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

      // Ranked match: the first to the kill target wins, ending the match.
      if (this.ranked && !this.matchOver && killer && killer.kills >= MATCH_KILL_TARGET) {
        this.endMatch(killer.sessionId);
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

  /** Decide a ranked match: record each player's verdict, broadcast the final
   *  scoreboard, and freeze the sim so clients can show the results screen. */
  private endMatch(winnerId: string): void {
    this.matchOver = true;
    const scores: { id: string; name: string; kills: number; deaths: number }[] = [];
    this.state.players.forEach((player, sessionId) => {
      this.outcomes.set(sessionId, sessionId === winnerId ? 'win' : 'loss');
      scores.push({ id: sessionId, name: player.name, kills: player.kills, deaths: player.deaths });
    });
    this.broadcast(ServerMessage.MatchOver, {
      winnerId,
      winnerName: this.state.players.get(winnerId)?.name ?? 'Unknown',
      target: MATCH_KILL_TARGET,
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

      // Capture pre-move position to derive locomotion (run vs idle) below.
      const startX = player.x;
      const startZ = player.z;

      const m = this.movement;
      const pending = this.pendingCasts.get(sessionId);
      if (pending) {
        // Rooted wind-up: resolve when the timer elapses, no movement meanwhile.
        if (this.simTime >= pending.resolveAt) {
          this.resolveCast(
            player,
            pending.ability,
            pending.config,
            pending.dirX,
            pending.dirZ,
            pending.targetX,
            pending.targetZ,
          );
          this.pendingCasts.delete(sessionId);
        }
      } else if (this.attackTargets.has(sessionId)) {
        // Auto-attack: chase the target into range, then strike on a timer.
        this.updateAutoAttack(player, sessionId, dt);
      } else {
        // Point-and-click movement: walk toward the active destination, if any.
        const dest = this.destinations.get(sessionId);
        if (dest) {
          const dx = dest.x - player.x;
          const dz = dest.z - player.z;
          const distance = Math.hypot(dx, dz);
          const remaining = distance - m.stoppingDistance;
          // Epsilon so the arrival branch reliably fires (avoids hovering a
          // hair above the threshold forever due to float rounding).
          if (remaining > 0.02) {
            const ndx = dx / distance;
            const ndz = dz / distance;
            // Constant speed for the whole trip (decided at issue time) so the
            // player doesn't slow to a walk as it nears the mark.
            const walk = this.walkSpeedFor(player.characterClass);
            const speed = dest.sprint ? walk * m.sprintMultiplier : walk;
            const step = Math.min(speed * dt, remaining);
            player.x = clamp(player.x + ndx * step, -limit, limit);
            player.z = clamp(player.z + ndz * step, -limit, limit);
            const face = Math.atan2(ndx, ndz);
            player.rotation = lerpAngle(player.rotation, face, 1 - Math.exp(-m.rotationSpeed * dt));
          } else {
            // Arrived: stop. (While the button is held the client keeps
            // re-issuing the target, so this only sticks after release.)
            this.destinations.delete(sessionId);
          }
        }
      }

      // Resolve obstacle collisions on the final horizontal position.
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

      // Authoritative animation: one-shots over locomotion (Run = sprinting).
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
      const sprinting = this.destinations.get(sessionId)?.sprint ?? false;
      // Moving cancels a dance (but not a combat pose like cast/attack).
      const active = this.animOneShots.get(sessionId);
      if (active && moving && isEmote(active.name)) this.animOneShots.delete(sessionId);
      player.animState = computeAnimState({
        alive: true,
        moving,
        sprinting,
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
        if (target) this.dealDamage(target, meta.damage, meta.ownerId);
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
    const spawn = ARENA_SPAWN_POINTS[Math.floor(Math.random() * ARENA_SPAWN_POINTS.length)];
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
    reviveFull(player);
  }
}
