import RAPIER, { type RigidBody, type World } from '@dimforge/rapier3d-compat';
import { DESTRUCTIBLE_BOUND, DESTRUCTIBLE_GRAVITY, TICK_RATE, type ArenaObstacle } from '@arena/shared';

/** A dynamic cylinder body to add to the world (tires, drums, launched barrels). */
export interface CylinderSpec {
  x: number;
  y: number;
  z: number;
  /** Cylinder half-height (Y-aligned): thin = disc/tire, tall = drum/barrel. */
  halfHeight: number;
  radius: number;
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
}

/**
 * The arena's shared server-side physics world (Rapier). It owns the ground,
 * the perimeter walls and a fixed collider for every cover piece, so any
 * destructible prop OR launched barrel rests on the floor, collides with cover,
 * and can bump the others. The room steps it once per tick; the destructible and
 * barrel systems add/remove bodies and read back the transforms they replicate.
 *
 * Running physics ONLY on the server keeps destruction authoritative — clients
 * just render the synced transforms (they never simulate, so they can't desync).
 */
export class ArenaPhysics {
  readonly world: World;

  constructor(obstacles: readonly ArenaObstacle[]) {
    this.world = new RAPIER.World({ x: 0, y: -DESTRUCTIBLE_GRAVITY, z: 0 });
    this.world.timestep = 1 / TICK_RATE; // one step per server tick
    this.buildStatics(obstacles);
  }

  /** Ground slab, perimeter walls, and a fixed cylinder per cover piece. */
  private buildStatics(obstacles: readonly ArenaObstacle[]): void {
    const w = this.world;
    // Ground: a thick slab whose top surface is y = 0.
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(120, 0.5, 120).setTranslation(0, -0.5, 0).setFriction(1).setRestitution(0),
    );
    // Perimeter walls so nothing slides/rolls out of the arena.
    const b = DESTRUCTIBLE_BOUND;
    const wall = (hx: number, hz: number, x: number, z: number) =>
      w.createCollider(RAPIER.ColliderDesc.cuboid(hx, 4, hz).setTranslation(x, 4, z));
    wall(b + 1, 1, 0, b + 1);
    wall(b + 1, 1, 0, -(b + 1));
    wall(1, b + 1, b + 1, 0);
    wall(1, b + 1, -(b + 1), 0);
    // Cover pieces (trailers/cars/dumpsters/…) as fixed cylinders.
    for (const o of obstacles) {
      const h = o.height || 2;
      w.createCollider(
        RAPIER.ColliderDesc.cylinder(h / 2, o.radius).setTranslation(o.x, h / 2, o.z).setFriction(0.8),
      );
    }
  }

  /** Add a dynamic cylinder body and return it. */
  addCylinder(s: CylinderSpec): RigidBody {
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.x, s.y, s.z)
        .setLinearDamping(s.linearDamping)
        .setAngularDamping(s.angularDamping)
        .setCcdEnabled(true), // small fast props shouldn't tunnel through walls
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(s.halfHeight, s.radius)
        .setFriction(s.friction)
        .setRestitution(s.restitution)
        .setMass(s.mass),
      rb,
    );
    return rb;
  }

  /** Remove a body (and its colliders) from the world. */
  removeBody(rb: RigidBody): void {
    this.world.removeRigidBody(rb);
  }

  /** Advance the simulation one tick. */
  step(): void {
    this.world.step();
  }

  /** Free the underlying WASM world (call on room dispose). */
  free(): void {
    this.world.free();
  }
}
