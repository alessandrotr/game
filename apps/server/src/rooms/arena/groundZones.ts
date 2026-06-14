import { GroundZone } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';

/** Server-only bookkeeping for one ground zone (the replicated transform lives on
 *  {@link GroundZone}; the timing/damage is server-authoritative). */
interface Zone {
  obj: GroundZone;
  /** Sim-time (ms) the zone disappears at. */
  endsAt: number;
  /** Sim-time (ms) of the next damage tick. */
  nextTickAt: number;
  /** Tick interval (ms). */
  tickMs: number;
  /** Damage dealt to everyone inside each tick. */
  tickDamage: number;
  /** Session id credited with the damage (excluded from the blast, like all AoE). */
  fromId: string;
}

/**
 * Lingering ground effects — currently the molotov's burning puddle. Each zone is
 * a static circle that ticks `tickDamage` to every enemy inside `radius` every
 * `tickMs`, until `durationMs` elapses and it's removed. Replicated via the
 * {@link GroundZone} schema so clients render the circle (sized to the damage
 * area); the damage itself runs entirely here.
 */
export class GroundZoneSystem {
  private readonly zones = new Map<string, Zone>();
  private seq = 0;

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
  ) {}

  /** Spawn a damaging puddle at (x,z). Damages enemies of `fromId` (the thrower is
   *  excluded, like every other AoE in the game). */
  spawn(
    kind: string,
    x: number,
    z: number,
    radius: number,
    tickDamage: number,
    tickMs: number,
    durationMs: number,
    fromId: string,
  ): void {
    const obj = new GroundZone();
    obj.id = `gz${this.seq++}`;
    obj.kind = kind;
    obj.x = x;
    obj.z = z;
    obj.radius = radius;
    this.ctx.state.groundZones.set(obj.id, obj);

    const now = this.ctx.now();
    this.zones.set(obj.id, {
      obj,
      endsAt: now + durationMs,
      // First tick lands one interval in (the impact burst already hit on landing).
      nextTickAt: now + tickMs,
      tickMs,
      tickDamage,
      fromId,
    });
  }

  /** Per-tick processing: deal due ticks and remove expired puddles. */
  update(): void {
    const now = this.ctx.now();
    for (const zone of [...this.zones.values()]) {
      if (now >= zone.endsAt) {
        this.ctx.state.groundZones.delete(zone.obj.id);
        this.zones.delete(zone.obj.id);
        continue;
      }
      while (now >= zone.nextTickAt) {
        this.combat.forEachEnemyInRadius(
          zone.obj.x,
          zone.obj.z,
          zone.obj.radius,
          zone.fromId,
          (enemy) => this.combat.dealDamage(enemy, zone.tickDamage, zone.fromId),
        );
        zone.nextTickAt += zone.tickMs;
      }
    }
  }
}
