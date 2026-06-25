import {
  GUN_BULLET_VFX,
  PLAYER_RADIUS,
  PROJECTILE_LIFETIME_MS,
  ServerMessage,
  DESTRUCTIBLE_BOUND,
  ZOMBIE_ROOM_HALF_SIZE,
  type AutoAttackConfig,
  type GunConfig,
  type LeafEffect,
} from '@arena/shared';
import { Projectile, type Player } from '../schema.js';
import { runCast } from '../../abilities/executor.js';
import { BARREL_RADIUS } from './barrels.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';

/** Spawn height of a projectile above the ground. */
const PROJECTILE_Y = 1;

/** Hard cap on per-tick collision sub-steps — bounds the work for a pathological
 *  speed while still letting the fastest real projectiles (the sniper) sweep. */
const MAX_SUBSTEPS = 16;

/** Total direct damage in an on-hit effect list — what a projectile chips off a
 *  cover structure it strikes (ability projectiles carry `onHit` damage leaves). */
function sumDamage(onHit: LeafEffect[] | undefined): number {
  if (!onHit) return 0;
  let total = 0;
  for (const e of onHit) if (e.type === 'damage') total += e.amount;
  return total;
}

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
  /** If true, the projectile pierces players (damages each once, keeps flying);
   *  it still stops on cover. `hit` tracks the players already pierced. */
  pierce?: boolean;
  /** Max enemies a piercing projectile hits before it's consumed (omitted =
   *  unlimited). The hit that reaches this count stops the projectile. */
  pierceMax?: number;
  hit?: Set<string>;
  /** For thrown pickables: a callback run at the projectile's final position when
   *  it's consumed (hit anything) or reaches its range — the AoE burst lives here,
   *  so the projectile itself carries no direct damage. */
  onImpact?: (x: number, z: number) => void;
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
   *  executor against whoever it collides with). With `count` > 1 it fires a
   *  burst: the first shot now, the rest `intervalMs` apart from the owner's
   *  position at fire time (along the original aim). */
  spawnProjectile(
    owner: Player,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    onHit: LeafEffect[],
    count = 1,
    intervalMs = 0,
    pierce = false,
    pierceMax?: number,
  ): void {
    this.fireAbilityShot(owner, vfx, dirX, dirZ, speed, range, radius, onHit, pierce, pierceMax);
    for (let i = 1; i < count; i++) {
      this.ctx.setTimeout(() => {
        const live = this.ctx.state.players.get(owner.sessionId);
        if (live && live.alive)
          this.fireAbilityShot(live, vfx, dirX, dirZ, speed, range, radius, onHit, pierce, pierceMax);
      }, i * intervalMs);
    }
  }

  /** Spawn a single ability projectile carrying its `onHit` effects. */
  private fireAbilityShot(
    owner: Player,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    onHit: LeafEffect[],
    pierce = false,
    pierceMax?: number,
  ): void {
    const id = this.spawn(owner, vfx, dirX, dirZ, speed, range, radius, 0);
    const meta = this.meta.get(id)!;
    meta.onHit = onHit;
    if (pierce) {
      meta.pierce = true;
      meta.pierceMax = pierceMax;
      meta.hit = new Set();
    }
  }

  /** Spawn a thrown pickable (molotov / grenade). It carries no direct/on-hit
   *  damage — it just flies until it's consumed (hits a player / prop / cover /
   *  obstacle) or reaches its range, then `onImpact` runs at its final position to
   *  resolve the burst (+ any lingering puddle). */
  spawnThrown(
    owner: Player,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    onImpact: (x: number, z: number) => void,
  ): void {
    const id = this.spawn(owner, vfx, dirX, dirZ, speed, range, radius, 0);
    this.meta.get(id)!.onImpact = onImpact;
  }

  /** Spawn a gun bullet (Gun Mode Zombie). A fast, small projectile carrying flat
   *  damage — it reuses the auto-attack hit path (direct `dealDamage`), so the
   *  zombie-mode friendly-fire guard already restricts it to hitting zombies. */
  spawnGunBullet(owner: Player, dirX: number, dirZ: number, gun: GunConfig): void {
    this.spawn(owner, GUN_BULLET_VFX, dirX, dirZ, gun.bulletSpeed, gun.bulletRange, gun.bulletRadius, gun.damage);
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

      // Advance in sub-steps so a fast projectile can't tunnel past a thin target
      // between ticks: cap each advance to ~half the hit radius and collision-check
      // at every sub-position (a 85 u/s sniper would otherwise jump ~4u per tick,
      // far more than its ~1u hit radius, and sail through enemies at range).
      const step = meta.speed * dt;
      const maxAdvance = Math.max(0.1, (meta.radius + PLAYER_RADIUS) * 0.5);
      const subSteps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(step / maxAdvance)));
      const inc = step / subSteps;

      for (let s = 0; s < subSteps; s++) {
        projectile.x += meta.dirX * inc;
        projectile.z += meta.dirZ * inc;
        meta.traveled += inc;

        // Map boundary collision check (thrown pickable objects like Molotovs/grenades only):
        if (meta.onImpact) {
          const bound = this.ctx.state.zombieMode ? ZOMBIE_ROOM_HALF_SIZE : DESTRUCTIBLE_BOUND;
          const boundLimit = bound - meta.radius;
          if (Math.abs(projectile.x) >= boundLimit || Math.abs(projectile.z) >= boundLimit) {
            projectile.x = Math.max(-boundLimit, Math.min(boundLimit, projectile.x));
            projectile.z = Math.max(-boundLimit, Math.min(boundLimit, projectile.z));

            this.ctx.broadcast(ServerMessage.ProjectileImpact, {
              ability: meta.ability,
              x: projectile.x,
              z: projectile.z,
            });
            expired.push(id);
            break;
          }
        }

        if (meta.traveled >= meta.range || now - meta.spawnedAt > PROJECTILE_LIFETIME_MS) {
          expired.push(id);
          break;
        }
        if (this.tryHit(projectile, meta)) {
          expired.push(id);
          break;
        }
      }
    });

    for (const id of expired) {
      // Thrown pickables burst at their final position (hit something, or reached
      // their range) — resolve that before the entity is removed.
      const m = this.meta.get(id);
      if (m?.onImpact) {
        const p = this.ctx.state.projectiles.get(id);
        if (p) m.onImpact(p.x, p.z);
      }
      this.ctx.state.projectiles.delete(id);
      this.meta.delete(id);
    }
  }

  /** Resolve collisions at the projectile's current position — barrels,
   *  destructibles, cover structures, static obstacles, then players (in that
   *  priority) — performing the matching side effect. Returns true if the
   *  projectile is consumed by the hit. */
  private tryHit(projectile: Projectile, meta: ProjectileMeta): boolean {
    // Barrels: a projectile that strikes one launches + detonates it (and is
    // consumed). Checked before cover so a barrel in front of a wall reacts.
    let hitBarrel = false;
    this.ctx.state.barrels.forEach((barrel) => {
      if (hitBarrel || !barrel.alive) return;
      const dx = barrel.x - projectile.x;
      const dz = barrel.z - projectile.z;
      const r = meta.radius + BARREL_RADIUS;
      if (dx * dx + dz * dz <= r * r) {
        this.combat.triggerBarrel(barrel, meta.dirX, meta.dirZ, meta.ownerId);
        hitBarrel = true;
      }
    });
    if (hitBarrel) return true;

    // The projectile's damage (auto-attack flat damage, or the ability's on-hit
    // damage) — chips drum HP and cover-structure HP alike.
    const projDmg = meta.damage > 0 ? meta.damage : sumDamage(meta.onHit);

    // Destructibles (tires / barrels / building parts): a projectile that strikes
    // one shoves it physically (and chips drum HP) and is consumed.
    if (
      this.combat.hitDestructible(
        projectile.x,
        projectile.z,
        meta.radius,
        meta.dirX,
        meta.dirZ,
        meta.ownerId,
        projDmg,
      )
    ) {
      return true;
    }

    // Cover structures (trailers/cars/dumpsters): a projectile that strikes a
    // live one deals its damage (chipping toward a crumble) and is consumed.
    if (
      projDmg > 0 &&
      this.combat.hitStructure(projectile.x, projectile.z, meta.radius, projDmg, meta.dirX, meta.dirZ)
    ) {
      this.ctx.broadcast(ServerMessage.ProjectileImpact, {
        ability: meta.ability,
        x: projectile.x,
        z: projectile.z,
      });
      return true;
    }

    // Obstacles block projectiles (cover) — burst an impact at the wall so the
    // block reads, instead of the projectile silently vanishing. Obstacles tagged
    // `blockProjectiles: false` (the central pond moat) are skipped — shots fly
    // over the water even though players must walk around it.
    for (const o of this.ctx.obstacles) {
      if (o.blockProjectiles === false) continue;
      const dx = projectile.x - o.x;
      const dz = projectile.z - o.z;
      const r = o.radius + meta.radius;
      if (dx * dx + dz * dz <= r * r) {
        this.ctx.broadcast(ServerMessage.ProjectileImpact, {
          ability: meta.ability,
          x: projectile.x,
          z: projectile.z,
        });
        return true;
      }
    }

    // Collide with the first eligible player (MapSchema isn't a standard
    // iterable, so use forEach and capture the first hit). A piercing projectile
    // skips players it has already struck.
    let hitId: string | null = null;
    this.ctx.state.players.forEach((target, targetId) => {
      if (hitId || targetId === meta.ownerId || !target.alive) return;
      if (meta.hit?.has(targetId)) return; // already pierced this one
      const dx = target.x - projectile.x;
      const dz = target.z - projectile.z;
      const entityRadius = target.skinId === 'skin.zombie.miniboss' ? 0.8 : PLAYER_RADIUS;
      const hitRadiusSq = (meta.radius + entityRadius) * (meta.radius + entityRadius);
      if (dx * dx + dz * dz <= hitRadiusSq) hitId = targetId;
    });
    if (!hitId) return false;

    const target = this.ctx.state.players.get(hitId);
    const owner = this.ctx.state.players.get(meta.ownerId);
    if (target) {
      if (meta.onHit && owner) {
        // Ability projectile: run its composable on-hit effects (damage + any
        // status/knockback) against the player it struck.
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
    // Piercing: record this enemy and keep flying — unless it has now hit its
    // cap (the Nth enemy stops it). Without piercing the first hit consumes it.
    if (meta.pierce) {
      meta.hit!.add(hitId);
      if (meta.pierceMax !== undefined && meta.hit!.size >= meta.pierceMax) return true;
      return false;
    }
    return true;
  }
}
