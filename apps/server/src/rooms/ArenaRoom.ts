import { Room, type Client } from '@colyseus/core';
import {
  ABILITIES,
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
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
} from '@arena/shared';
import { ArenaState, Player, Projectile } from './schema.js';

/** Maximum accepted display-name length. */
const MAX_NAME_LENGTH = 24;
/** Spawn height of a projectile above the ground. */
const PROJECTILE_Y = 1;

/** Server-only metadata for an in-flight projectile (not replicated). */
interface ProjectileMeta {
  ownerId: string;
  ability: AbilityKind;
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
  resolveAt: number;
}

/** Squared distance from point (px,pz) to segment (ax,az)-(bx,bz) on the ground plane. */
function segmentDistanceSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  let t = lenSq > 0 ? ((px - ax) * abx + (pz - az) * abz) / lenSq : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
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
      // Lock sprint-vs-walk based on the distance at issue time.
      const sprint = Math.hypot(x - player.x, z - player.z) > this.movement.sprintThreshold;
      this.destinations.set(client.sessionId, { x, z, sprint });
    });

    this.onMessage(ClientMessage.Jump, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      if (this.grounded.get(client.sessionId)) {
        this.verticalVelocity.set(client.sessionId, this.movement.jumpForce);
        this.grounded.set(client.sessionId, false);
      }
    });

    this.onMessage<{ ability: AbilityKind; dirX: number; dirZ: number }>(
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
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.destinations.delete(client.sessionId);
    this.verticalVelocity.delete(client.sessionId);
    this.grounded.delete(client.sessionId);
    this.cooldowns.delete(client.sessionId);
    this.respawnAt.delete(client.sessionId);
    this.pendingCasts.delete(client.sessionId);
  }

  // --- Abilities ---------------------------------------------------------

  private handleCast(
    sessionId: string,
    message: { ability: AbilityKind; dirX: number; dirZ: number },
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

    // Commit cost + cooldown at cast start, then face the cast direction.
    player.mana -= config.manaCost;
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
    });

    if (config.castTimeMs > 0) {
      // Rooted wind-up: cancel any move and resolve when the timer elapses.
      this.destinations.delete(sessionId);
      this.pendingCasts.set(sessionId, {
        ability,
        config,
        dirX,
        dirZ,
        resolveAt: this.simTime + config.castTimeMs,
      });
    } else {
      this.resolveCast(player, ability, config, dirX, dirZ);
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
  ): void {
    switch (ability) {
      case 'fireball':
        this.spawnProjectile(player, ability, config, dirX, dirZ);
        break;
      case 'charge':
        this.performDash(player, config, dirX, dirZ);
        break;
      case 'heal':
        player.hp = Math.min(player.maxHp, player.hp + (config.healAmount ?? 0));
        break;
      case 'frost_nova':
        // Point-blank burst around the caster.
        this.applyAoeDamage(player.x, player.z, config.aoeRadius ?? 4, config.damage, player.sessionId);
        break;
      case 'blink':
        this.blink(player, config, dirX, dirZ);
        break;
      case 'meteor': {
        // Rooted during the wind-up, so the caster's position is the launch
        // point: the strike lands `range` units ahead in the cast direction.
        const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
        const tx = clamp(player.x + dirX * config.range, -limit, limit);
        const tz = clamp(player.z + dirZ * config.range, -limit, limit);
        this.applyAoeDamage(tx, tz, config.aoeRadius ?? 3, config.damage, player.sessionId);
        break;
      }
    }
  }

  /** Instant teleport `range` units along the cast direction, clamped to the
   *  arena and pushed out of obstacles. No damage. */
  private blink(caster: Player, config: AbilityConfig, dirX: number, dirZ: number): void {
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
    const destX = clamp(caster.x + dirX * config.range, -limit, limit);
    const destZ = clamp(caster.z + dirZ * config.range, -limit, limit);
    const fixed = collideArenaObstacles(destX, destZ);
    caster.x = fixed.x;
    caster.z = fixed.z;
    // Cancel any in-flight move so the player doesn't slide back to a stale target.
    this.destinations.delete(caster.sessionId);
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
      if (dx * dx + dz * dz <= hitSq) this.applyDamage(target, damage, exceptId);
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

  private performDash(
    caster: Player,
    config: (typeof ABILITIES)[AbilityKind],
    dirX: number,
    dirZ: number,
  ): void {
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
    const distance = config.dashDistance ?? 6;
    const startX = caster.x;
    const startZ = caster.z;
    const endX = clamp(startX + dirX * distance, -limit, limit);
    const endZ = clamp(startZ + dirZ * distance, -limit, limit);
    const hitRadiusSq = (config.dashRadius ?? 1) + PLAYER_RADIUS;

    this.state.players.forEach((target, id) => {
      if (id === caster.sessionId || !target.alive) return;
      const distSq = segmentDistanceSq(startX, startZ, endX, endZ, target.x, target.z);
      if (distSq <= hitRadiusSq * hitRadiusSq) {
        this.applyDamage(target, config.damage, caster.sessionId);
      }
    });

    caster.x = endX;
    caster.z = endZ;
  }

  private applyDamage(target: Player, amount: number, fromId: string): void {
    if (!target.alive || amount <= 0) return;
    target.hp = Math.max(0, target.hp - amount);
    const lethal = target.hp <= 0;

    this.broadcast(ServerMessage.Damage, {
      from: fromId,
      to: target.sessionId,
      amount,
      lethal,
    });

    if (lethal) {
      target.alive = false;
      this.destinations.delete(target.sessionId);
      this.respawnAt.set(target.sessionId, this.simTime + RESPAWN_DELAY_MS);
    }
  }

  // --- Simulation --------------------------------------------------------

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
    const dt = deltaMs / 1000;
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;

    this.state.players.forEach((player, sessionId) => {
      if (!player.alive) {
        this.pendingCasts.delete(sessionId);
        const respawn = this.respawnAt.get(sessionId);
        if (respawn !== undefined && this.simTime >= respawn) {
          this.resetPlayer(player);
          this.verticalVelocity.set(sessionId, 0);
          this.grounded.set(sessionId, true);
          this.respawnAt.delete(sessionId);
        }
        return;
      }

      player.mana = Math.min(player.maxMana, player.mana + MANA_REGEN * dt);

      const m = this.movement;
      const pending = this.pendingCasts.get(sessionId);
      if (pending) {
        // Rooted wind-up: resolve when the timer elapses, no movement meanwhile.
        if (this.simTime >= pending.resolveAt) {
          this.resolveCast(player, pending.ability, pending.config, pending.dirX, pending.dirZ);
          this.pendingCasts.delete(sessionId);
        }
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
        if (target) this.applyDamage(target, meta.damage, meta.ownerId);
        expired.push(id);
      }
    });

    for (const id of expired) {
      this.state.projectiles.delete(id);
      this.projectileMeta.delete(id);
    }
  }

  // --- Helpers -----------------------------------------------------------

  /** Reset a player to a full, alive state at a random spawn point. */
  private resetPlayer(player: Player): void {
    const range = ARENA_HALF_SIZE - PLAYER_RADIUS * 2;
    player.x = (Math.random() * 2 - 1) * range;
    player.z = (Math.random() * 2 - 1) * range;
    player.y = GROUND_Y;
    player.hp = PLAYER_MAX_HP;
    player.maxHp = PLAYER_MAX_HP;
    player.mana = PLAYER_MAX_MANA;
    player.maxMana = PLAYER_MAX_MANA;
    player.alive = true;
  }
}
