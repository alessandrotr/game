import { GroundZone } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';
import {
  isZombieSkin,
  PLAYER_RADIUS,
  ServerMessage,
  SINGULARITY_DAMAGE,
  BUFF_BUFF_DURATION_MS,
  TICK_RATE,
} from '@arena/shared';

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
 * Lingering ground effects — molotov's burning puddle, singularity vortex, or flux core overcharge.
 * Each zone is a static circle with custom per-tick or expiration behaviors.
 * Replicated via the {@link GroundZone} schema so clients render it.
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

  /** Per-tick processing: deal due ticks, run pulls/buffs, and remove expired puddles. */
  update(): void {
    const now = this.ctx.now();
    for (const zone of [...this.zones.values()]) {
      if (now >= zone.endsAt) {
        // Expiration logic
        if (zone.obj.kind === 'singularity') {
          const radius = zone.obj.radius;
          // Explode and deal 80 damage to all players and zombies in range (non-player-safe)
          this.ctx.state.players.forEach((player) => {
            if (!player.alive) return;
            const dx = player.x - zone.obj.x;
            const dz = player.z - zone.obj.z;
            const dist = Math.hypot(dx, dz);
            const r = player.skinId === 'skin.zombie.miniboss' ? 0.8 : PLAYER_RADIUS;
            if (dist <= radius + r) {
              this.combat.dealDamage(player, SINGULARITY_DAMAGE, '');
            }
          });
          // Broadcast detonation VFX to clients
          this.ctx.broadcast(ServerMessage.Detonation, {
            kind: 'grenade',
            x: zone.obj.x,
            z: zone.obj.z,
            radius: zone.obj.radius,
          });
        }

        this.ctx.state.groundZones.delete(zone.obj.id);
        this.zones.delete(zone.obj.id);
        continue;
      }

      // Per-tick gravitational pull / energy buffs
      if (zone.obj.kind === 'singularity') {
        const radius = zone.obj.radius;
        this.ctx.state.players.forEach((player) => {
          if (!player.alive) return;
          const dx = zone.obj.x - player.x;
          const dz = zone.obj.z - player.z;
          const dist = Math.hypot(dx, dz);
          const r = player.skinId === 'skin.zombie.miniboss' ? 0.8 : PLAYER_RADIUS;
          if (dist > 0.01 && dist <= radius + r) {
            // Dynamic gravity acceleration pull: stronger closer to center
            const pullSpeed = 1.5 + (1.0 - Math.min(1, dist / radius)) * 4.5;
            const step = Math.min(pullSpeed * (1 / TICK_RATE), dist);
            player.x += (dx / dist) * step;
            player.z += (dz / dist) * step;
          }
        });
      } else if (zone.obj.kind === 'buff_core') {
        const radius = zone.obj.radius;
        this.ctx.state.players.forEach((player) => {
          if (!player.alive || isZombieSkin(player.skinId)) return;
          const dx = player.x - zone.obj.x;
          const dz = player.z - zone.obj.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= radius + PLAYER_RADIUS) {
            this.combat.applyStatus(player, { kind: 'buff', durationMs: BUFF_BUFF_DURATION_MS }, '');
          }
        });
      }

      // Damage ticks (e.g. for molotov fire field)
      while (now >= zone.nextTickAt) {
        if (zone.tickDamage > 0) {
          this.combat.forEachEnemyInRadius(
            zone.obj.x,
            zone.obj.z,
            zone.obj.radius,
            zone.fromId,
            (enemy) => this.combat.dealDamage(enemy, zone.tickDamage, zone.fromId),
          );
        }
        zone.nextTickAt += zone.tickMs;
      }
    }
  }
}
