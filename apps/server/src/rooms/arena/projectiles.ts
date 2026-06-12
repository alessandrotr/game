import {
  PLAYER_RADIUS,
  PROJECTILE_LIFETIME_MS,
  ServerMessage,
  type AutoAttackConfig,
  type LeafEffect,
} from '@arena/shared';
import { Projectile, type Player } from '../schema.js';
import { runCast } from '../../abilities/executor.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';

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

/**
 * In-flight projectile simulation: spawning (ability + auto-attack), per-tick
 * movement, and collision against obstacles and players. Owns the non-replicated
 * projectile metadata; the replicated {@link Projectile} entities live in the
 * room state. On a hit it runs the ability's composable on-hit effects via the
 * executor, or deals flat damage for plain auto-attacks.
 */
export class ProjectileSystem {
  private readonly meta = new Map<string, ProjectileMeta>();
  private seq = 0;

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
  ) {}

  /** Spawn an ability projectile carrying its `onHit` effects (run by the
   *  executor against whoever it collides with). */
  spawnProjectile(
    owner: Player,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    onHit: LeafEffect[],
  ): void {
    const id = this.spawn(owner, vfx, dirX, dirZ, speed, range, radius, 0);
    this.meta.get(id)!.onHit = onHit;
  }

  /** Spawn a basic-attack projectile (ranged auto-attacks). */
  spawnAutoProjectile(owner: Player, dirX: number, dirZ: number, cfg: AutoAttackConfig): void {
    this.spawn(
      owner,
      cfg.projectileVfx ?? 'fireball',
      dirX,
      dirZ,
      cfg.projectileSpeed ?? 20,
      cfg.range + 6,
      cfg.projectileRadius ?? 0.5,
      cfg.damage,
    );
  }

  /** Create the replicated entity + server metadata for a projectile. */
  private spawn(
    owner: Player,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    damage: number,
  ): string {
    const id = `p${this.seq++}`;
    const projectile = new Projectile();
    projectile.id = id;
    projectile.ownerId = owner.sessionId;
    projectile.ability = vfx;
    // Start just in front of the caster so it doesn't immediately self-collide.
    projectile.x = owner.x + dirX * (PLAYER_RADIUS + 0.3);
    projectile.z = owner.z + dirZ * (PLAYER_RADIUS + 0.3);
    projectile.y = PROJECTILE_Y;
    this.ctx.state.projectiles.set(id, projectile);

    this.meta.set(id, {
      ownerId: owner.sessionId,
      ability: vfx,
      dirX,
      dirZ,
      speed,
      range,
      radius,
      damage,
      traveled: 0,
      spawnedAt: this.ctx.now(),
    });
    return id;
  }

  update(dt: number): void {
    const now = this.ctx.now();
    const expired: string[] = [];

    this.ctx.state.projectiles.forEach((projectile, id) => {
      const meta = this.meta.get(id);
      if (!meta) {
        expired.push(id);
        return;
      }

      const step = meta.speed * dt;
      projectile.x += meta.dirX * step;
      projectile.z += meta.dirZ * step;
      meta.traveled += step;

      if (meta.traveled >= meta.range || now - meta.spawnedAt > PROJECTILE_LIFETIME_MS) {
        expired.push(id);
        return;
      }

      // Obstacles block projectiles (cover) — burst an impact at the wall so the
      // block reads, instead of the projectile silently vanishing.
      for (const o of this.ctx.obstacles) {
        const dx = projectile.x - o.x;
        const dz = projectile.z - o.z;
        const r = o.radius + meta.radius;
        if (dx * dx + dz * dz <= r * r) {
          this.ctx.broadcast(ServerMessage.ProjectileImpact, {
            ability: meta.ability,
            x: projectile.x,
            z: projectile.z,
          });
          expired.push(id);
          return;
        }
      }

      // Collide with the first eligible player (MapSchema isn't a standard
      // iterable, so use forEach and capture the first hit).
      const hitRadiusSq = (meta.radius + PLAYER_RADIUS) * (meta.radius + PLAYER_RADIUS);
      let hitId: string | null = null;
      this.ctx.state.players.forEach((target, targetId) => {
        if (hitId || targetId === meta.ownerId || !target.alive) return;
        const dx = target.x - projectile.x;
        const dz = target.z - projectile.z;
        if (dx * dx + dz * dz <= hitRadiusSq) hitId = targetId;
      });
      if (hitId) {
        const target = this.ctx.state.players.get(hitId);
        const owner = this.ctx.state.players.get(meta.ownerId);
        if (target) {
          if (meta.onHit && owner) {
            // Ability projectile: run its composable on-hit effects (damage +
            // any status/knockback) against the player it struck.
            runCast(
              meta.onHit,
              { caster: owner, dirX: meta.dirX, dirZ: meta.dirZ, unitTarget: target },
              this.combat.effectRuntime,
            );
          } else {
            // Auto-attack projectile: a plain direct hit.
            this.combat.dealDamage(target, meta.damage, meta.ownerId);
          }
        }
        expired.push(id);
      }
    });

    for (const id of expired) {
      this.ctx.state.projectiles.delete(id);
      this.meta.delete(id);
    }
  }
}
