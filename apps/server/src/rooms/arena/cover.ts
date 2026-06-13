import { type Collider } from '@dimforge/rapier3d-compat';
import { PLAYER_RADIUS, ServerMessage, type ArenaObstacle, type CoverStructureSpec } from '@arena/shared';
import { CoverStructure } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';
import type { ArenaPhysics } from './physics.js';

/** A car detonates on destruction: 100 damage to everything within 5 units. */
const CAR_EXPLOSION_DAMAGE = 100;
const CAR_EXPLOSION_RADIUS = 5;

/** True for car cover (the only structure that explodes when destroyed). */
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
  /** id → the collision circle this structure contributes (for removal on death). */
  private readonly circles = new Map<string, ArenaObstacle>();
  /** id → the structure's fixed physics collider (so drums/barrels bounce off it;
   *  removed on crumble so props can roll over the rubble). */
  private readonly colliders = new Map<string, Collider>();

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
      this.ctx.state.structures.set(cs.id, cs);

      const circle: ArenaObstacle = { x: s.x, z: s.z, radius: s.radius, height: s.height };
      this.circles.set(cs.id, circle);
      this.collision.push(circle); // collidable while alive (movement + projectiles)
      // A matching fixed collider in the physics world so dynamic props (drums,
      // launched barrels) bounce off it too.
      this.colliders.set(cs.id, this.physics.addStaticCylinder(s.x, s.z, s.radius, s.height));
    });
  }

  /** A live (un-destroyed) structure by id — for auto-attack targeting. */
  liveStructure(id: string): CoverStructure | undefined {
    const s = this.ctx.state.structures.get(id);
    return s && !s.destroyed ? s : undefined;
  }

  /** Apply `amount` damage to a structure by id; crumble it if its HP runs out. */
  damage(id: string, amount: number): void {
    const s = this.ctx.state.structures.get(id);
    if (!s || s.destroyed || amount <= 0) return;
    s.hp = Math.max(0, s.hp - amount);
    if (s.hp <= 0) this.crumble(s);
  }

  /** Damage the first alive structure a projectile at (x,z) of radius `projR`
   *  overlaps. Returns true if one was hit (the caller consumes the projectile). */
  hitProjectile(x: number, z: number, projR: number, amount: number): boolean {
    for (const s of this.ctx.state.structures.values()) {
      if (s.destroyed) continue;
      const dx = s.x - x;
      const dz = s.z - z;
      const r = s.radius + projR;
      if (dx * dx + dz * dz <= r * r) {
        this.damage(s.id, amount);
        return true;
      }
    }
    return false;
  }

  /** Damage every alive structure whose footprint is within `radius` of (x,z) —
   *  used by AoE abilities. */
  damageInRadius(x: number, z: number, radius: number, amount: number): void {
    this.ctx.state.structures.forEach((s) => {
      if (s.destroyed) return;
      const dx = s.x - x;
      const dz = s.z - z;
      const r = radius + s.radius;
      if (dx * dx + dz * dz <= r * r) this.damage(s.id, amount);
    });
  }

  /** Crumble: mark destroyed, pull its collision circle, burst dust/debris, and
   *  — for cars — detonate, dealing area damage to nearby players. */
  private crumble(s: CoverStructure): void {
    s.destroyed = true;
    const circle = this.circles.get(s.id);
    if (circle) {
      const i = this.collision.indexOf(circle);
      if (i >= 0) this.collision.splice(i, 1); // now uncollidable (movement + projectiles)
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

  /** A destroyed car explodes: flat area damage to every player in the blast
   *  (caught attackers included — it's a neutral hazard, credited to no one). */
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
  }
}
