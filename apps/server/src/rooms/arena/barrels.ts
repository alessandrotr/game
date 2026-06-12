import { PLAYER_RADIUS, ServerMessage } from '@arena/shared';
import { Barrel } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';

/** Hit footprint of a barrel (projectile / AoE detection). */
export const BARREL_RADIUS = 0.6;

// Launch + explosion tuning.
const LAUNCH_SPEED = 11; // horizontal slide away from the hit (u/s)
const LAUNCH_VY = 6.5; // initial upward pop (u/s)
const GRAVITY = 20; // fall accel (u/s²)
const FUSE_MS = 900; // hard cap before it detonates even mid-air
const EXPLOSION_RADIUS = 4.5;
const EXPLOSION_DAMAGE = 35;
const BOUND = 24.5; // keep a launched barrel inside the arena

/** Server-only flight state for a triggered barrel (not replicated). */
interface BarrelMeta {
  vx: number;
  vz: number;
  vy: number;
  fuseAt: number;
  fromId: string;
}

/**
 * Interactive burning barrels: idle props that, when struck (auto-attack,
 * projectile, or AoE), launch away from the hit in an arc and then detonate —
 * dealing area damage to nearby players and chain-triggering other barrels. The
 * arc is integrated server-side and replicated via the barrel's x/y/z, so all
 * clients see the same toss + blast.
 */
export class BarrelSystem {
  private readonly meta = new Map<string, BarrelMeta>();

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
  ) {}

  /** Spawn the match's barrels from the generated layout positions. */
  init(positions: { x: number; z: number }[]): void {
    this.ctx.state.barrels.clear();
    this.meta.clear();
    positions.forEach((p, i) => {
      const b = new Barrel();
      b.id = `b${i}`;
      b.x = p.x;
      b.z = p.z;
      b.y = 0;
      b.alive = true;
      this.ctx.state.barrels.set(b.id, b);
    });
  }

  /** Whether a barrel is present and not already triggered. */
  private isLive(b: Barrel | undefined): b is Barrel {
    return !!b && b.alive && !this.meta.has(b.id);
  }

  /** Look up a live barrel by id (for auto-attack targeting). */
  liveBarrel(id: string): Barrel | undefined {
    const b = this.ctx.state.barrels.get(id);
    return this.isLive(b) ? b : undefined;
  }

  /** Trigger a barrel: launch it along (dirX,dirZ) — i.e. away from the hit —
   *  and arm its fuse. No-op if it's already flying/gone. */
  trigger(b: Barrel, dirX: number, dirZ: number, fromId: string): void {
    if (!this.isLive(b)) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.meta.set(b.id, {
      vx: (dirX / len) * LAUNCH_SPEED,
      vz: (dirZ / len) * LAUNCH_SPEED,
      vy: LAUNCH_VY,
      fuseAt: this.ctx.now() + FUSE_MS,
      fromId,
    });
  }

  /** Trigger every live barrel within `radius` of (x,z), launching each outward
   *  from the centre. Used by AoE abilities and chain reactions. */
  triggerInRadius(x: number, z: number, radius: number, fromId: string): void {
    const rSq = (radius + BARREL_RADIUS) * (radius + BARREL_RADIUS);
    this.ctx.state.barrels.forEach((b) => {
      if (!this.isLive(b)) return;
      const dx = b.x - x;
      const dz = b.z - z;
      if (dx * dx + dz * dz <= rSq) this.trigger(b, dx, dz, fromId);
    });
  }

  /** Integrate launched barrels; detonate on landing or when the fuse elapses. */
  update(dt: number): void {
    const now = this.ctx.now();
    const exploded: Barrel[] = [];
    this.ctx.state.barrels.forEach((b) => {
      const m = this.meta.get(b.id);
      if (!m) return;
      m.vy -= GRAVITY * dt;
      b.x = Math.max(-BOUND, Math.min(BOUND, b.x + m.vx * dt));
      b.z = Math.max(-BOUND, Math.min(BOUND, b.z + m.vz * dt));
      b.y += m.vy * dt;
      const landed = b.y <= 0 && m.vy < 0;
      if (landed || now >= m.fuseAt) {
        b.y = 0;
        exploded.push(b);
      }
    });
    for (const b of exploded) this.explode(b);
  }

  /** Detonate: area-damage nearby players, chain nearby barrels, then despawn. */
  private explode(b: Barrel): void {
    const fromId = this.meta.get(b.id)?.fromId ?? '';
    this.meta.delete(b.id);
    b.alive = false;

    const hitSq = (EXPLOSION_RADIUS + PLAYER_RADIUS) * (EXPLOSION_RADIUS + PLAYER_RADIUS);
    this.ctx.state.players.forEach((target) => {
      if (!target.alive) return;
      const dx = target.x - b.x;
      const dz = target.z - b.z;
      if (dx * dx + dz * dz <= hitSq) this.combat.dealDamage(target, EXPLOSION_DAMAGE, fromId);
    });

    this.ctx.broadcast(ServerMessage.BarrelExplosion, { x: b.x, z: b.z });

    // Chain: blast triggers other live barrels caught in it.
    this.triggerInRadius(b.x, b.z, EXPLOSION_RADIUS, fromId);

    this.ctx.state.barrels.delete(b.id);
  }
}
