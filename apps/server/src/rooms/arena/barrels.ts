import { type RigidBody } from '@dimforge/rapier3d-compat';
import {
  PLAYER_RADIUS,
  ServerMessage,
  randomSpawnPoint,
  unlockedPlayArea,
  type RoomLayout,
} from '@arena/shared';
import { Barrel } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';
import type { ArenaPhysics } from './physics.js';

/** Hit footprint of a barrel (projectile / AoE detection). */
export const BARREL_RADIUS = 0.6;

// --- Periodic respawn: drop a fresh wave of barrels onto open ground. ---
/** Smallest wave (also the main-room baseline). */
const RESPAWN_MIN_COUNT = 2;
/** Largest wave, reached once the whole arena is unlocked. */
const RESPAWN_MAX_COUNT = 8;
/** Min/max delay (ms) between respawn waves. */
const RESPAWN_MIN_MS = 15_000;
const RESPAWN_MAX_MS = 25_000;
/** Live-barrel capacity scales with the unlocked floor area to keep density
 *  roughly constant: 1 barrel per this many world units² (≈ the main room's
 *  10 barrels / 2500u²). Clamped to [BARREL_CAP_MIN, BARREL_CAP_MAX]. */
const AREA_PER_BARREL = 250;
const BARREL_CAP_MIN = 10;
const BARREL_CAP_MAX = 60;
/** Empty radius reserved at each wing's centre for a future structure. */
const CENTER_RESERVE = 6;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

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
  /** Monotonic id counter (initial layout + every respawn share it). */
  private seq = 0;
  /** Sim time (ms) the next respawn wave is due. */
  private nextSpawnAt = 0;
  /** The room layout — lets respawns spread across unlocked sections (zombie mode). */
  private roomLayout: RoomLayout | null = null;

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
    private readonly physics: ArenaPhysics,
  ) {}

  /** Set the room layout so respawns target the whole unlocked area (zombie mode). */
  setRoomLayout(layout: RoomLayout): void {
    this.roomLayout = layout;
  }

  /** Spawn the match's barrels from the generated layout positions. */
  init(positions: { x: number; z: number }[]): void {
    this.ctx.state.barrels.clear();
    this.bodies.clear();
    this.armed.clear();
    this.seq = 0;
    for (const p of positions) this.spawnAt(p.x, p.z);
    this.nextSpawnAt = this.ctx.now() + this.randomRespawnDelay();
  }

  /** Create one barrel (replicated entity + physics body) at (x,z). */
  private spawnAt(x: number, z: number): void {
    const b = new Barrel();
    b.id = `b${this.seq++}`;
    b.x = x;
    b.z = z;
    b.y = REST_Y;
    b.alive = true;
    this.ctx.state.barrels.set(b.id, b);
    this.bodies.set(
      b.id,
      this.physics.addCylinder({
        x,
        y: REST_Y,
        z,
        halfHeight: BODY_HALF_HEIGHT,
        radius: BODY_RADIUS,
        mass: MASS,
        friction: FRICTION,
        restitution: RESTITUTION,
        linearDamping: LINEAR_DAMPING,
        angularDamping: ANGULAR_DAMPING,
      }),
    );
  }

  private randomRespawnDelay(): number {
    return RESPAWN_MIN_MS + Math.random() * (RESPAWN_MAX_MS - RESPAWN_MIN_MS);
  }

  /** Append barrels for a newly unlocked section (room expansion system). */
  addBarrels(positions: { x: number; z: number }[]): void {
    for (const p of positions) this.spawnAt(p.x, p.z);
  }

  /** Live-barrel cap, scaled by how much of the arena is unlocked. */
  private barrelCapacity(): number {
    const area = unlockedPlayArea(this.roomLayout, this.ctx.state.unlockedSections);
    return clamp(Math.round(area / AREA_PER_BARREL), BARREL_CAP_MIN, BARREL_CAP_MAX);
  }

  /** Drop a wave of fresh barrels onto open ground (up to the live cap). Wave size
   *  grows with capacity so a larger arena refills at a believable pace. */
  private respawnWave(): void {
    const cap = this.barrelCapacity();
    const maxWave = clamp(Math.round(cap * 0.25), RESPAWN_MIN_COUNT, RESPAWN_MAX_COUNT);
    const want = RESPAWN_MIN_COUNT + Math.floor(Math.random() * (maxWave - RESPAWN_MIN_COUNT + 1));
    const room = cap - this.ctx.state.barrels.size;
    const n = Math.min(want, room);
    for (let i = 0; i < n; i++) {
      const spot = this.findOpenSpot();
      if (spot) this.spawnAt(spot.x, spot.z);
    }
  }

  /** A random point — spread across the main room + unlocked sections — clear of
   *  cover, players and other barrels, or null if too crowded after several tries. */
  private findOpenSpot(): { x: number; z: number } | null {
    for (let i = 0; i < 40; i++) {
      const spot = randomSpawnPoint(
        this.roomLayout,
        this.ctx.state.unlockedSections,
        BARREL_RADIUS + 1,
        Math.random,
        CENTER_RESERVE,
      );
      if (spot && this.isClearSpot(spot.x, spot.z)) return spot;
    }
    return null;
  }

  private isClearSpot(x: number, z: number): boolean {
    // Clear of cover / static obstacles (with a little breathing room).
    for (const o of this.ctx.obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      const r = o.radius + BARREL_RADIUS + 0.5;
      if (dx * dx + dz * dz < r * r) return false;
    }
    // Don't drop a barrel on top of a player or another barrel.
    let blocked = false;
    this.ctx.state.players.forEach((p) => {
      if (!p.alive) return;
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < 4) blocked = true; // ~2u clearance
    });
    this.ctx.state.barrels.forEach((b) => {
      const dx = x - b.x;
      const dz = z - b.z;
      const r = BARREL_RADIUS * 2;
      if (dx * dx + dz * dz < r * r) blocked = true;
    });
    return !blocked;
  }

  /** Look up a live, not-yet-triggered barrel by id (auto-attack targeting). */
  liveBarrel(id: string): Barrel | undefined {
    const b = this.ctx.state.barrels.get(id);
    return b && b.alive && !this.armed.has(id) ? b : undefined;
  }

  /**
   * Check for the closest live barrel that passes the checker function.
   * If found, returns the distance and a callback to trigger/launch it.
   */
  tryKick(
    check: (x: number, z: number, radius: number) => number | null,
    dirX: number,
    dirZ: number,
    fromId: string,
  ): { distance: number; perform: () => void } | null {
    let bestBarrel: Barrel | null = null;
    let bestDist = Infinity;

    this.ctx.state.barrels.forEach((barrel) => {
      if (!barrel.alive || this.armed.has(barrel.id)) return;
      const dist = check(barrel.x, barrel.z, BARREL_RADIUS);
      if (dist !== null && dist < bestDist) {
        bestDist = dist;
        bestBarrel = barrel;
      }
    });

    if (!bestBarrel) return null;
    return {
      distance: bestDist,
      perform: () => {
        this.trigger(bestBarrel!, dirX, dirZ, fromId);
      },
    };
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
    // Periodically drop a fresh wave of barrels onto the map.
    if (now >= this.nextSpawnAt) {
      this.respawnWave();
      this.nextSpawnAt = now + this.randomRespawnDelay();
    }
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

    // The blast also damages every object in range: cover structures take damage
    // (cars chain-detonate), oil drums lose HP / tires scatter, and other barrels
    // chain off the trigger below.
    this.combat.effectRuntime.damageStructuresInRadius(b.x, b.z, EXPLOSION_RADIUS, EXPLOSION_DAMAGE);
    this.combat.effectRuntime.pushDestructiblesInRadius(b.x, b.z, EXPLOSION_RADIUS, fromId, EXPLOSION_DAMAGE);

    this.ctx.broadcast(ServerMessage.BarrelExplosion, { x: b.x, z: b.z });

    // Chain: the blast launches other live barrels caught in it.
    this.triggerInRadius(b.x, b.z, EXPLOSION_RADIUS, fromId);

    const rb = this.bodies.get(b.id);
    if (rb) this.physics.removeBody(rb);
    this.bodies.delete(b.id);
    this.ctx.state.barrels.delete(b.id);
  }

  /** Pull every explosive barrel toward the vortex center. */
  pull(vortexX: number, vortexZ: number, pullRadius: number): void {
    for (const rb of this.bodies.values()) {
      const t = rb.translation();
      const dx = vortexX - t.x;
      const dz = vortexZ - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01 && dist <= pullRadius + BODY_RADIUS) {
        const pullSpeed = (3.0 + (1.0 - Math.min(1, dist / pullRadius)) * 3.0) * 2;
        // Apply an inward impulse towards the center every tick
        const force = pullSpeed * MASS * 0.15; // tuning factor
        rb.applyImpulse({
          x: (dx / dist) * force,
          y: 0,
          z: (dz / dist) * force,
        }, true);
      }
    }
  }
}
