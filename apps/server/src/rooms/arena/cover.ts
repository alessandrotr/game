import { type Collider } from '@dimforge/rapier3d-compat';
import {
  ARENA_HALF_SIZE,
  PLAYER_RADIUS,
  ServerMessage,
  structureFootprint,
  isTrailerAsset,
  TRAILER_HALF_LENGTH,
  TRAILER_HALF_WIDTH,
  type ArenaObstacle,
  type CoverStructureSpec,
} from '@arena/shared';
import { CoverStructure } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';
import type { ArenaPhysics } from './physics.js';

/** A car detonates on destruction: 100 damage to everything within 5 units. */
const CAR_EXPLOSION_DAMAGE = 100;
const CAR_EXPLOSION_RADIUS = 5;

// --- Car kinematics: cars roll when shot ------------------------------------
// A car sits on wheels, so a hit shoves it instead of just chipping it. The hit
// direction is split onto the car's long axis (front↔back) and its side axis;
// it rolls freely along the long axis but barely budges sideways (tyres resist
// a lateral skid). The car keeps its own velocity, which the room integrates
// each tick with rolling friction until it coasts to a stop.
/** Velocity (u/s) a reference-damage hit adds when it lands square on the nose/tail. */
const CAR_HIT_SPEED = 4.6;
/** Damage that maps to a full-strength shove; smaller/bigger hits scale around it. */
const CAR_PUSH_REF_DMG = 30;
/** Push-strength clamp so a huge nuke can't fling a car across the map. */
const CAR_MAX_PUSH_SCALE = 1.6;
/** Anisotropy: rolls fully along its length, only a fraction of that sideways. */
const CAR_FORWARD_GAIN = 1;
const CAR_SIDE_GAIN = 0.18;
/** Speed cap (u/s) and per-second rolling friction (coasts to rest in ~1.5s). */
const CAR_MAX_SPEED = 6;
const CAR_FRICTION = 1.6;
/** Below this speed (u/s) the car is snapped to rest (stops replicating churn). */
const CAR_MIN_SPEED = 0.15;

/** True for car cover (the only structure that explodes when destroyed AND the
 *  only kind that rolls when shot). */
function isCar(assetId: string): boolean {
  return assetId.includes('car');
}

/**
 * Destructible cover structures — trailers (the arena's "houses"), burned cars
 * and dumpsters. Each has HP scaled to its size (a trailer caps at 500, smaller
 * cover scales down) and blocks movement + projectiles while alive. When its HP
 * is depleted it crumbles: it stops colliding (its circle is pulled from the
 * shared collision set) and is replicated as `destroyed` so clients flatten it
 * to rubble. These never move — they're static cover that can be demolished.
 *
 * The system shares the room's live obstacle array (so a destroyed structure is
 * instantly uncollidable for movement and projectiles) and owns the per-id
 * collision circles it added to it.
 */
export class CoverSystem {
  /** id → the collision circle(s) this structure contributes (a single circle for
   *  most cover, a row of circles forming a capsule for elongated trailers). Kept
   *  for removal on death and for the structure's own hit tests. */
  private readonly circles = new Map<string, ArenaObstacle[]>();
  /** id → the structure's fixed physics collider (so drums/barrels bounce off it;
   *  removed on crumble so props can roll over the rubble). */
  private readonly colliders = new Map<string, Collider>();
  /** Cars only: their current rolling velocity (u/s). Present ⇒ this structure
   *  is a car that can be shoved; absent ⇒ static cover that never moves. */
  private readonly carVel = new Map<string, { vx: number; vz: number }>();
  /** Ids of indestructible structures (zombie-mode trailers): they block movement
   *  and projectiles but ignore all damage and never crumble. */
  private readonly indestructible = new Set<string>();

  constructor(
    private readonly ctx: ArenaContext,
    /** The room's live collision set — structure circles are pushed in here and
     *  spliced out on crumble, so movement/projectiles see the change at once. */
    private readonly collision: ArenaObstacle[],
    /** Combat, for the area damage a car deals when it detonates on death. */
    private readonly combat: CombatSystem,
    /** The shared physics world — structures register a fixed collider here so
     *  dynamic props (drums, launched barrels) collide with them. */
    private readonly physics: ArenaPhysics,
  ) {}

  /** Spawn the match's HP-bearing cover from the generated layout. */
  init(specs: CoverStructureSpec[]): void {
    this.ctx.state.structures.clear();
    this.circles.clear();
    this.colliders.clear();
    this.carVel.clear();
    this.indestructible.clear();
    specs.forEach((s, i) => {
      const cs = new CoverStructure();
      cs.id = `s${i}`;
      cs.assetId = s.assetId;
      cs.x = s.x;
      cs.z = s.z;
      cs.rotation = s.rotation;
      cs.radius = s.radius;
      cs.height = s.height;
      cs.hp = s.maxHp;
      cs.maxHp = s.maxHp;
      cs.destroyed = false;
      cs.lengthScale = s.lengthScale ?? 1;
      this.ctx.state.structures.set(cs.id, cs);

      // Collision footprint: a length-fitted capsule for trailers, a single circle
      // otherwise — so the collider matches the structure's true shape/size.
      const circles = structureFootprint(s.assetId, s.x, s.z, s.rotation, s.radius, s.height, s.lengthScale ?? 1);
      this.circles.set(cs.id, circles);
      for (const c of circles) this.collision.push(c); // collidable while alive (movement + projectiles)
      // A matching fixed collider in the physics world so dynamic props (drums,
      // launched barrels) bounce off it too — a yaw-fitted box for trailers, a
      // cylinder for the rest.
      this.colliders.set(
        cs.id,
        isTrailerAsset(s.assetId)
          ? this.physics.addStaticBox(
              s.x,
              s.z,
              TRAILER_HALF_LENGTH * (s.lengthScale ?? 1),
              TRAILER_HALF_WIDTH,
              s.height,
              s.rotation,
            )
          : this.physics.addStaticCylinder(s.x, s.z, s.radius, s.height),
      );
      // Cars roll when shot — give them a (zero) velocity to integrate.
      if (isCar(cs.assetId)) this.carVel.set(cs.id, { vx: 0, vz: 0 });
      // Zombie-mode trailers are indestructible — solid cover that never crumbles.
      if (s.indestructible) this.indestructible.add(cs.id);
    });
  }

  /** A live (un-destroyed) structure by id — for auto-attack targeting. */
  liveStructure(id: string): CoverStructure | undefined {
    const s = this.ctx.state.structures.get(id);
    return s && !s.destroyed ? s : undefined;
  }

  /** True if (x,z) lies within `pad` of this structure's collision footprint —
   *  any of its capsule circles (trailers) or its single circle. */
  private footprintHit(id: string, x: number, z: number, pad: number): boolean {
    const circles = this.circles.get(id);
    if (!circles) return false;
    for (const c of circles) {
      const dx = c.x - x;
      const dz = c.z - z;
      const r = c.radius + pad;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  /** Apply `amount` damage to a structure by id; crumble it if its HP runs out.
   *  `(dirX,dirZ)` is the hit's travel direction — a car is shoved along it (see
   *  {@link pushCar}); other cover ignores it. */
  damage(id: string, amount: number, dirX = 0, dirZ = 0): void {
    const s = this.ctx.state.structures.get(id);
    if (!s || s.destroyed || amount <= 0) return;
    if (this.indestructible.has(id)) return; // zombie-mode trailers take no damage
    if (dirX || dirZ) this.pushCar(s, dirX, dirZ, amount);
    s.hp = Math.max(0, s.hp - amount);
    if (s.hp <= 0) this.crumble(s);
  }

  /** Damage the first alive structure a projectile at (x,z) of radius `projR`
   *  overlaps. `(dirX,dirZ)` is the projectile's travel direction (shoves cars).
   *  Returns true if one was hit (the caller consumes the projectile). */
  hitProjectile(x: number, z: number, projR: number, amount: number, dirX = 0, dirZ = 0): boolean {
    for (const s of this.ctx.state.structures.values()) {
      if (s.destroyed) continue;
      if (this.footprintHit(s.id, x, z, projR)) {
        this.damage(s.id, amount, dirX, dirZ);
        return true;
      }
    }
    return false;
  }

  /** Damage every alive structure whose footprint is within `radius` of (x,z) —
   *  used by AoE abilities. Cars are shoved radially outward from the blast. */
  damageInRadius(x: number, z: number, radius: number, amount: number): void {
    this.ctx.state.structures.forEach((s) => {
      if (s.destroyed) return;
      // Hit if the blast reaches the structure's footprint; shove cars away from
      // the blast centre (the structure's centre is the push reference).
      if (this.footprintHit(s.id, x, z, radius)) this.damage(s.id, amount, s.x - x, s.z - z);
    });
  }

  /**
   * Shove a car along the hit's travel direction, split onto its own axes: it
   * rolls freely along its length (front/back hits send it a long way) but
   * resists a sideways skid (side hits only nudge it). No-op for non-car cover
   * (only cars are registered in {@link carVel}). The accumulated velocity is
   * integrated — and friction applied — in {@link update}.
   */
  private pushCar(s: CoverStructure, dirX: number, dirZ: number, amount: number): void {
    const vel = this.carVel.get(s.id);
    if (!vel) return;
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-3) return;
    const dx = dirX / len;
    const dz = dirZ / len;
    // Car axes from its yaw: forward is the long (X) axis, side is the Z axis —
    // matching how the prop is rendered (rotation about Y).
    const fx = Math.cos(s.rotation);
    const fz = -Math.sin(s.rotation);
    const sx = Math.sin(s.rotation);
    const sz = Math.cos(s.rotation);
    const alongF = dx * fx + dz * fz; // signed component down the car's length
    const alongS = dx * sx + dz * sz; // signed component across the car
    const speed = CAR_HIT_SPEED * Math.min(CAR_MAX_PUSH_SCALE, amount / CAR_PUSH_REF_DMG + 0.4);
    vel.vx += (alongF * CAR_FORWARD_GAIN * fx + alongS * CAR_SIDE_GAIN * sx) * speed;
    vel.vz += (alongF * CAR_FORWARD_GAIN * fz + alongS * CAR_SIDE_GAIN * sz) * speed;
    const m = Math.hypot(vel.vx, vel.vz);
    if (m > CAR_MAX_SPEED) {
      vel.vx = (vel.vx / m) * CAR_MAX_SPEED;
      vel.vz = (vel.vz / m) * CAR_MAX_SPEED;
    }
  }

  /**
   * Roll moving cars forward one tick: integrate velocity, keep them inside the
   * arena and out of other cover, sync the collision circle + physics collider
   * to the new spot, then bleed off speed with rolling friction. Cheap no-op
   * when nothing is moving. Called by the room each tick (before the physics
   * step, so drums/barrels collide against the car's new position).
   */
  update(dt: number): void {
    if (this.carVel.size === 0) return;
    this.carVel.forEach((vel, id) => {
      if (vel.vx === 0 && vel.vz === 0) return;
      const s = this.ctx.state.structures.get(id);
      if (!s || s.destroyed) {
        vel.vx = 0;
        vel.vz = 0;
        return;
      }
      let nx = s.x + vel.vx * dt;
      let nz = s.z + vel.vz * dt;
      // Arena walls: clamp and kill the velocity into the wall.
      const lim = ARENA_HALF_SIZE - s.radius;
      if (nx > lim) {
        nx = lim;
        vel.vx = 0;
      } else if (nx < -lim) {
        nx = -lim;
        vel.vx = 0;
      }
      if (nz > lim) {
        nz = lim;
        vel.vz = 0;
      } else if (nz < -lim) {
        nz = -lim;
        vel.vz = 0;
      }
      // Don't roll through other cover: push back to the edge of any circle it
      // overlaps and cancel the velocity heading into it (skip the car's own).
      // Cars are single-circle cover (never trailers), so its footprint is one circle.
      const self = this.circles.get(id)?.[0];
      for (const o of this.collision) {
        if (o === self) continue;
        const ddx = nx - o.x;
        const ddz = nz - o.z;
        const min = o.radius + s.radius;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nxn = ddx / d;
          const nzn = ddz / d;
          nx = o.x + nxn * min;
          nz = o.z + nzn * min;
          const into = vel.vx * nxn + vel.vz * nzn;
          if (into < 0) {
            vel.vx -= into * nxn;
            vel.vz -= into * nzn;
          }
        }
      }
      // Commit: replicated transform, collision circle, and physics collider.
      s.x = nx;
      s.z = nz;
      if (self) {
        self.x = nx;
        self.z = nz;
      }
      this.colliders.get(id)?.setTranslation({ x: nx, y: s.height / 2, z: nz });
      // Rolling friction → coast to a stop, then snap to rest.
      const decay = Math.max(0, 1 - CAR_FRICTION * dt);
      vel.vx *= decay;
      vel.vz *= decay;
      if (Math.hypot(vel.vx, vel.vz) < CAR_MIN_SPEED) {
        vel.vx = 0;
        vel.vz = 0;
      }
    });
  }

  /** Crumble: mark destroyed, pull its collision circle, burst dust/debris, and
   *  — for cars — detonate, dealing area damage to nearby players. */
  private crumble(s: CoverStructure): void {
    s.destroyed = true;
    const vel = this.carVel.get(s.id);
    if (vel) {
      vel.vx = 0;
      vel.vz = 0;
    }
    const circles = this.circles.get(s.id);
    if (circles) {
      for (const circle of circles) {
        const i = this.collision.indexOf(circle);
        if (i >= 0) this.collision.splice(i, 1); // now uncollidable (movement + projectiles)
      }
      this.circles.delete(s.id);
    }
    const collider = this.colliders.get(s.id);
    if (collider) {
      this.physics.removeCollider(collider); // props now roll over the rubble
      this.colliders.delete(s.id);
    }
    this.ctx.broadcast(ServerMessage.StructureCrumbled, { x: s.x, z: s.z, radius: s.radius });
    if (isCar(s.assetId)) this.detonate(s);
  }

  /** A destroyed car explodes: flat area damage to everything in the blast — every
   *  player AND every nearby object. It's a neutral hazard, credited to no one.
   *  The blast chips other cover (chain-detonating adjacent cars), launches burning
   *  barrels and scatters drums/tires — so a row of props can go up in a chain. */
  private detonate(s: CoverStructure): void {
    const reach = CAR_EXPLOSION_RADIUS + PLAYER_RADIUS;
    const reachSq = reach * reach;
    this.ctx.state.players.forEach((target) => {
      if (!target.alive) return;
      const dx = target.x - s.x;
      const dz = target.z - s.z;
      if (dx * dx + dz * dz <= reachSq) {
        this.combat.dealDamage(target, CAR_EXPLOSION_DAMAGE, s.id);
      }
    });
    this.ctx.broadcast(ServerMessage.CarExplosion, {
      x: s.x,
      z: s.z,
      radius: CAR_EXPLOSION_RADIUS,
    });
    // Objects in the blast: other cover (this car is already `destroyed`, so it
    // can't re-hit itself; a struck car that reaches 0 HP chain-detonates here),
    // burning barrels, and drums/tires.
    this.damageInRadius(s.x, s.z, CAR_EXPLOSION_RADIUS, CAR_EXPLOSION_DAMAGE);
    this.combat.triggerBarrelsInRadius(s.x, s.z, CAR_EXPLOSION_RADIUS, s.id);
    this.combat.pushDestructiblesInRadius(s.x, s.z, CAR_EXPLOSION_RADIUS, s.id, CAR_EXPLOSION_DAMAGE);
  }
}
