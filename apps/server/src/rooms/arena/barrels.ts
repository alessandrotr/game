import { type RigidBody } from '@dimforge/rapier3d-compat';
import { PLAYER_RADIUS, ServerMessage } from '@arena/shared';
import { Barrel } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';
import type { ArenaPhysics } from './physics.js';

/** Hit footprint of a barrel (projectile / AoE detection). */
export const BARREL_RADIUS = 0.6;

// --- Body shape (the burning fire-drum) ---
const BODY_RADIUS = 0.45;
const BODY_HALF_HEIGHT = 0.5;
/** Resting center height (cylinder center sits at its half-height on the floor). */
const REST_Y = BODY_HALF_HEIGHT;

// --- Launch + explosion tuning ---
/** Horizontal launch impulse away from the hit (mass·u/s). */
const LAUNCH_IMPULSE_H = 16;
/** Upward launch impulse — the pop that starts the arc (mass·u/s). */
const LAUNCH_IMPULSE_V = 16;
const FUSE_MS = 900; // hard cap before it detonates even mid-air
/** Must be airborne at least this long before a ground touch counts as landing
 *  (so it doesn't detonate on the very first frame of the launch). */
const MIN_AIR_MS = 150;
const EXPLOSION_RADIUS = 4.5;
const EXPLOSION_DAMAGE = 35;

/** Per-barrel body mass / surface tuning. Low damping so it arcs and tumbles
 *  freely in the air; it detonates on landing, so ground behaviour barely matters. */
const MASS = 2;
const FRICTION = 0.5;
const RESTITUTION = 0.2;
const LINEAR_DAMPING = 0.2;
const ANGULAR_DAMPING = 0.4;

/** Armed (in-flight) state for a triggered barrel. */
interface Armed {
  fuseAt: number;
  armedAt: number;
  fromId: string;
}

/**
 * Interactive burning barrels: idle props that, when struck (auto-attack,
 * projectile, or AoE), are LAUNCHED by the shared Rapier world — a smooth real
 * arc that tumbles and bounces off cover — and then DETONATE on landing (or when
 * the fuse elapses), dealing area damage to nearby players and chain-triggering
 * other barrels. The body's transform (position + rotation) is replicated, so
 * every client sees the same toss + blast.
 */
export class BarrelSystem {
  private readonly bodies = new Map<string, RigidBody>();
  private readonly armed = new Map<string, Armed>();

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
    private readonly physics: ArenaPhysics,
  ) {}

  /** Spawn the match's barrels from the generated layout positions. */
  init(positions: { x: number; z: number }[]): void {
    this.ctx.state.barrels.clear();
    this.bodies.clear();
    this.armed.clear();
    positions.forEach((p, i) => {
      const b = new Barrel();
      b.id = `b${i}`;
      b.x = p.x;
      b.z = p.z;
      b.y = REST_Y;
      b.alive = true;
      this.ctx.state.barrels.set(b.id, b);
      this.bodies.set(
        b.id,
        this.physics.addCylinder({
          x: p.x,
          y: REST_Y,
          z: p.z,
          halfHeight: BODY_HALF_HEIGHT,
          radius: BODY_RADIUS,
          mass: MASS,
          friction: FRICTION,
          restitution: RESTITUTION,
          linearDamping: LINEAR_DAMPING,
          angularDamping: ANGULAR_DAMPING,
        }),
      );
    });
  }

  /** Look up a live, not-yet-triggered barrel by id (auto-attack targeting). */
  liveBarrel(id: string): Barrel | undefined {
    const b = this.ctx.state.barrels.get(id);
    return b && b.alive && !this.armed.has(id) ? b : undefined;
  }

  /** Launch a barrel along (dirX,dirZ) — away from the hit — and arm its fuse.
   *  No-op if it's already flying/gone. */
  trigger(b: Barrel, dirX: number, dirZ: number, fromId: string): void {
    const rb = this.bodies.get(b.id);
    if (!b.alive || !rb || this.armed.has(b.id)) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    const t = rb.translation();
    rb.applyImpulseAtPoint(
      { x: (dirX / len) * LAUNCH_IMPULSE_H, y: LAUNCH_IMPULSE_V, z: (dirZ / len) * LAUNCH_IMPULSE_H },
      { x: t.x, y: t.y + BODY_HALF_HEIGHT * 0.7, z: t.z }, // above center → tumble
      true,
    );
    const now = this.ctx.now();
    this.armed.set(b.id, { fuseAt: now + FUSE_MS, armedAt: now, fromId });
  }

  /** Trigger every live barrel within `radius` of (x,z), launching each outward
   *  from the centre. Used by AoE abilities and chain reactions. */
  triggerInRadius(x: number, z: number, radius: number, fromId: string): void {
    const rSq = (radius + BARREL_RADIUS) * (radius + BARREL_RADIUS);
    this.ctx.state.barrels.forEach((b) => {
      if (!b.alive || this.armed.has(b.id)) return;
      const dx = b.x - x;
      const dz = b.z - z;
      if (dx * dx + dz * dz <= rSq) this.trigger(b, dx, dz, fromId);
    });
  }

  /** Replicate launched/awake barrels' transforms (the room steps the shared
   *  world first) and detonate any that have landed or whose fuse elapsed. */
  update(): void {
    const now = this.ctx.now();
    const exploded: { b: Barrel; fromId: string }[] = [];
    this.ctx.state.barrels.forEach((b) => {
      const rb = this.bodies.get(b.id);
      if (!rb) return;
      const a = this.armed.get(b.id);
      if (!a && rb.isSleeping()) return; // idle barrel — nothing to sync
      const t = rb.translation();
      const r = rb.rotation();
      b.x = t.x;
      b.y = t.y;
      b.z = t.z;
      b.qx = r.x;
      b.qy = r.y;
      b.qz = r.z;
      b.qw = r.w;
      if (a) {
        const landed = now - a.armedAt > MIN_AIR_MS && t.y <= REST_Y + 0.25;
        if (landed || now >= a.fuseAt) exploded.push({ b, fromId: a.fromId });
      }
    });
    for (const e of exploded) this.explode(e.b, e.fromId);
  }

  /** Detonate: area-damage nearby players, chain nearby barrels, then despawn. */
  private explode(b: Barrel, fromId: string): void {
    this.armed.delete(b.id);
    b.alive = false;

    const hitSq = (EXPLOSION_RADIUS + PLAYER_RADIUS) * (EXPLOSION_RADIUS + PLAYER_RADIUS);
    this.ctx.state.players.forEach((target) => {
      if (!target.alive) return;
      const dx = target.x - b.x;
      const dz = target.z - b.z;
      if (dx * dx + dz * dz <= hitSq) this.combat.dealDamage(target, EXPLOSION_DAMAGE, fromId);
    });

    this.ctx.broadcast(ServerMessage.BarrelExplosion, { x: b.x, z: b.z });

    // Chain: the blast launches other live barrels caught in it.
    this.triggerInRadius(b.x, b.z, EXPLOSION_RADIUS, fromId);

    const rb = this.bodies.get(b.id);
    if (rb) this.physics.removeBody(rb);
    this.bodies.delete(b.id);
    this.ctx.state.barrels.delete(b.id);
  }
}
