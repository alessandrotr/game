import {
  DEATH_TRAP_COOLDOWN_MS,
  DEATH_TRAP_FIRE,
  DEATH_TRAP_THRESHOLD,
  HEAL_TRAP_COOLDOWN_MS,
  HEAL_TRAP_DROP_SCALE,
  HEAL_TRAP_THRESHOLD,
  TRAP_DEATH_WINDOW_MS,
  SINGULARITY_TRAP_THRESHOLD,
  SINGULARITY_TRAP_COOLDOWN_MS,
  SINGULARITY_DURATION_MS,
  BUFF_TRAP_THRESHOLD,
  BUFF_TRAP_COOLDOWN_MS,
  BUFF_DURATION_MS,
  type TrapDef,
} from '@arena/shared';
import { Trap } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { PickableSystem } from './pickables.js';
import type { GroundZoneSystem } from './groundZones.js';

/** Per-kind tuning resolved once when a trap is created. */
interface TrapTuning {
  threshold: number;
  cooldownMs: number;
}

const TUNING: Record<string, TrapTuning> = {
  heal: { threshold: HEAL_TRAP_THRESHOLD, cooldownMs: HEAL_TRAP_COOLDOWN_MS },
  death: { threshold: DEATH_TRAP_THRESHOLD, cooldownMs: DEATH_TRAP_COOLDOWN_MS },
  singularity: { threshold: SINGULARITY_TRAP_THRESHOLD, cooldownMs: SINGULARITY_TRAP_COOLDOWN_MS },
  buff: { threshold: BUFF_TRAP_THRESHOLD, cooldownMs: BUFF_TRAP_COOLDOWN_MS },
};

/** Server-only bookkeeping for one trap (the replicated transform + cooldown
 *  progress live on {@link Trap}; the activation logic is server-authoritative). */
interface TrapRuntime {
  obj: Trap;
  tuning: TrapTuning;
  radiusSq: number;
  /** Sim-times (ms) of qualifying zombie deaths in the rolling window. Only
   *  recorded while armed — deaths during cooldown are ignored by design. */
  deaths: number[];
  /** Sim-time (ms) the current cooldown ends; 0 when armed/ready. */
  cooldownEndsAt: number;
  /** Snapshot of `cooldownMs` at activation (for the progress arc). */
  cooldownSpan: number;
}

/**
 * Traps — fixed 6-radius zones placed in alternating zombie-mode sections that
 * "charge" off the horde. While armed, each qualifying zombie death inside the
 * radius is timestamped; once {@link TrapTuning.threshold} of them land within
 * {@link TRAP_DEATH_WINDOW_MS} the trap fires its effect and enters cooldown.
 * Deaths during cooldown are NOT counted; when the cooldown elapses the trap
 * re-arms with a fresh tally.
 *
 *  - Heal trap → drops a team-heal pickup (the same drop the mini-boss leaves).
 *  - Death trap → releases an ownerless molotov-style fire field over the trap.
 *
 * Zombie mode only; never created in gun mode (the room gates that). The system
 * is a no-op until {@link addTrap} is called when a section unlocks.
 */
export class TrapSystem {
  private readonly traps: TrapRuntime[] = [];
  private seq = 0;

  constructor(
    private readonly ctx: ArenaContext,
    private readonly pickables: PickableSystem,
    private readonly groundZones: GroundZoneSystem,
  ) {}

  /** Place a trap from its layout definition (replicated + armed). */
  addTrap(def: TrapDef): void {
    const tuning = TUNING[def.kind];
    if (!tuning) return;
    const obj = new Trap();
    obj.id = `trap${this.seq++}`;
    obj.kind = def.kind;
    obj.x = def.x;
    obj.z = def.z;
    obj.radius = def.radius;
    obj.cooldownProgress = 1;
    obj.chargeProgress = 0;
    this.ctx.state.traps.set(obj.id, obj);
    this.traps.push({
      obj,
      tuning,
      radiusSq: def.radius * def.radius,
      deaths: [],
      cooldownEndsAt: 0,
      cooldownSpan: tuning.cooldownMs,
    });
  }

  /** Record a zombie death at (x,z). Charges every armed trap whose radius
   *  contains the death; fires any that cross their threshold this tick. */
  recordZombieDeath(x: number, z: number): void {
    if (this.traps.length === 0) return;
    const now = this.ctx.now();
    const cutoff = now - TRAP_DEATH_WINDOW_MS;
    for (const t of this.traps) {
      if (t.cooldownEndsAt !== 0) continue; // on cooldown — deaths don't count
      const dx = t.obj.x - x;
      const dz = t.obj.z - z;
      if (dx * dx + dz * dz > t.radiusSq) continue;
      // Prune the window, then add this death.
      let kept = 0;
      for (const ts of t.deaths) if (ts >= cutoff) t.deaths[kept++] = ts;
      t.deaths.length = kept;
      t.deaths.push(now);
      t.obj.chargeProgress = t.deaths.length / t.tuning.threshold;
      if (t.deaths.length >= t.tuning.threshold) this.activate(t, now);
    }
  }

  /** Fire a trap's effect and start its cooldown. */
  private activate(t: TrapRuntime, now: number): void {
    const { x, z, radius, kind } = t.obj;
    if (kind === 'heal') {
      // Same drop as the mini-boss: a team heal pickup (heals 100 HP to the
      // stepper and every living teammate when grabbed).
      this.pickables.spawnGround('heal_pack', x, z, HEAL_TRAP_DROP_SCALE);
    } else if (kind === 'death') {
      // Molotov-style burning field sized to the whole trap. Ownerless (fromId
      // ''), so like a neutral explosion it burns zombies and players alike.
      const f = DEATH_TRAP_FIRE;
      this.groundZones.spawn('molotov_fire', x, z, radius, f.tickDamage, f.tickMs, f.durationMs, '');
    } else if (kind === 'singularity') {
      // Gravity well: pulls entities to the center for 5 seconds, then explodes.
      this.groundZones.spawn('singularity', x, z, radius, 0, 1000, SINGULARITY_DURATION_MS, '');
    } else if (kind === 'buff') {
      // Buff core: radiates energy for 10 seconds.
      this.groundZones.spawn('buff_core', x, z, radius, 0, 1000, BUFF_DURATION_MS, '');
    }
    t.deaths.length = 0;
    t.obj.chargeProgress = 0;
    t.cooldownSpan = t.tuning.cooldownMs;
    t.cooldownEndsAt = now + t.tuning.cooldownMs;
    t.obj.cooldownProgress = 0;
  }

  /** Per-tick: advance cooldown recharge and re-arm finished traps. */
  update(): void {
    if (this.traps.length === 0) return;
    const now = this.ctx.now();
    const cutoff = now - TRAP_DEATH_WINDOW_MS;
    for (const t of this.traps) {
      if (t.cooldownEndsAt === 0) {
        // Armed: check for expired deaths and update chargeProgress.
        let kept = 0;
        for (const ts of t.deaths) if (ts >= cutoff) t.deaths[kept++] = ts;
        t.deaths.length = kept;
        t.obj.chargeProgress = t.deaths.length / t.tuning.threshold;
      } else {
        // On cooldown
        t.obj.chargeProgress = 0;
        if (now >= t.cooldownEndsAt) {
          t.cooldownEndsAt = 0;
          t.obj.cooldownProgress = 1;
        } else {
          const remaining = t.cooldownEndsAt - now;
          t.obj.cooldownProgress = 1 - remaining / t.cooldownSpan;
        }
      }
    }
  }
}
