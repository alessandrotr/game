import { Room, type Client } from '@colyseus/core';
import {
  ABILITIES,
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  ARENA_SPAWN_POINTS,
  AUTO_ATTACKS,
  CLICK_ROTATION_SPEED,
  CLICK_SPRINT_THRESHOLD,
  CLICK_STOPPING_DISTANCE,
  collideArenaObstacles,
  GRAVITY,
  GROUND_Y,
  JUMP_FORCE,
  MANA_REGEN,
  MAX_PLAYERS,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PROJECTILE_LIFETIME_MS,
  RESPAWN_DELAY_MS,
  SPRINT_SPEED,
  TICK_MS,
  ClientMessage,
  ServerMessage,
  isAbilityKind,
  isCharacterClass,
  type AbilityConfig,
  type AbilityKind,
  type AutoAttackConfig,
  type CharacterClass,
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
  /** Current auto-attack target (a player session id) per attacker. */
  private readonly attackTargets = new Map<string, string>();
  /** Sim time (ms) each player's next auto-attack is ready. */
  private readonly attackReadyAt = new Map<string, number>();

  /** Accumulated simulation time in ms (used for cooldowns / respawn timers). */
  private simTime = 0;
  private projectileSeq = 0;

  /** Authoritative movement values, live-tunable via the dev tools. */
  private movement = {
    walkSpeed: PLAYER_SPEED,
    sprintSpeed: SPRINT_SPEED,
    jumpForce: JUMP_FORCE,
    sprintThreshold: CLICK_SPRINT_THRESHOLD,
    stoppingDistance: CLICK_STOPPING_DISTANCE,
    rotationSpeed: CLICK_ROTATION_SPEED,
  };

  /**
   * Authoritative ability balance, seeded from the shared defaults and
   * live-tunable via the dev tools (the Leva combat panel pushes overrides). A
   * per-room copy so tuning one room never leaks into another.
   */
  private readonly abilities: Record<AbilityKind, AbilityConfig> = structuredClone(ABILITIES);

  override onCreate(): void {
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
      const num = (v: unknown, fallback: number, max: number) =>
        Number.isFinite(v) ? clamp(v as number, 0, max) : fallback;
      this.movement.walkSpeed = num(message?.walkSpeed, this.movement.walkSpeed, 40);
      this.movement.sprintSpeed = num(message?.sprintSpeed, this.movement.sprintSpeed, 50);
      this.movement.jumpForce = num(message?.jumpForce, this.movement.jumpForce, 40);
      this.movement.sprintThreshold = num(message?.sprintThreshold, this.movement.sprintThreshold, 40);
      this.movement.stoppingDistance = num(message?.stoppingDistance, this.movement.stoppingDistance, 5);
      this.movement.rotationSpeed = num(message?.rotationSpeed, this.movement.rotationSpeed, 30);
    });

    this.onMessage(ClientMessage.StopMove, (client) => {
      this.destinations.delete(client.sessionId);
    });

    this.onMessage<{ text: string }>(ClientMessage.Chat, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      this.chat.handle(this, player?.name ?? 'Adventurer', message?.text);
    });

    this.onMessage(
      ClientMessage.AbilityTune,
      (_client, message: Partial<Record<AbilityKind, Partial<AbilityConfig>>>) => {
        if (!message || typeof message !== 'object') return;
        for (const [kind, overrides] of Object.entries(message)) {
          if (!isAbilityKind(kind) || !overrides) continue;
          const config = this.abilities[kind] as unknown as Record<string, number>;
          // Merge only finite, non-negative numeric fields — ignore junk.
          for (const [field, value] of Object.entries(overrides)) {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
              config[field] = value;
            }
          }
        }
      },
    );

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS);
  }

  override onJoin(
    client: Client,
    options?: { name?: string; characterClass?: string; skinId?: string },
  ): void {
    const player = new Player();
    player.sessionId = client.sessionId;
    player.name = (options?.name ?? '').trim().slice(0, MAX_NAME_LENGTH) || 'Adventurer';
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
  }

  override onLeave(client: Client): void {
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
  }

  // --- Abilities ---------------------------------------------------------

  private handleCast(
    sessionId: string,
    message: { ability: AbilityKind; dirX: number; dirZ: number; tx?: number; tz?: number },
  ): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive || !isAbilityKind(message?.ability)) return;

    const ability = message.ability;
    const config = this.abilities[ability];
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
    if (config.targeted && Number.isFinite(message.tx) && Number.isFinite(message.tz)) {
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
      const step = Math.min(this.movement.walkSpeed * dt, dist - cfg.range + 0.01);
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

  // --- Simulation --------------------------------------------------------

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
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
            const speed = dest.sprint ? m.sprintSpeed : m.walkSpeed;
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

      // Authoritative animation: one-shots (cast/attack/hit) over locomotion.
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
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
    player.maxHp = PLAYER_MAX_HP;
    player.maxMana = PLAYER_MAX_MANA;
    reviveFull(player);
  }
}
