/**
 * The ability effect executor — the single place that turns an ability's
 * declarative {@link Effect} list into authoritative world mutations. It replaces
 * the old per-ability `switch`: adding an ability is now pure data (a registry
 * entry); only adding a brand-new *verb* touches this file.
 *
 * The executor owns no state. It walks the effect tree and calls back into an
 * {@link EffectRuntime} (implemented by `ArenaRoom`) for every side effect, which
 * keeps it decoupled and unit-testable with a fake runtime.
 */

import type { Effect, LeafEffect, StatusSpec } from '@arena/shared';
import type { Player } from '../rooms/schema.js';

/** A combatant the executor operates on. `Player` (the schema) satisfies this. */
export type EffectActor = Player;

/** Everything an effect can ask the world to do. Implemented by the room. */
export interface EffectRuntime {
  /** Deal `amount` damage to `target`, credited to `fromId` (shield + amp applied).
   *  `ability` (the id of the ability dealing it) lets a Q-restricted empower
   *  bonus apply only to the right ability. */
  dealDamage(target: EffectActor, amount: number, fromId: string, ability?: string): void;
  /** Heal `target` by `amount` and broadcast healing feedback. */
  heal(target: EffectActor, amount: number, fromId: string): void;
  /** Grant `target` an absorb shield of `amount` for `durationMs`. */
  addShield(target: EffectActor, amount: number, durationMs: number, fromId: string): void;
  /** Apply (or refresh) a status on `target`. */
  applyStatus(target: EffectActor, spec: StatusSpec, fromId: string): void;
  /** Push `entity` along (dirX,dirZ) for `distance` units at `speed` u/s. With
   *  `damage`, it's a damaging dash — each enemy ploughed through takes it once,
   *  credited to `fromId`. */
  displace(
    entity: EffectActor,
    dirX: number,
    dirZ: number,
    distance: number,
    speed: number,
    damage?: number,
    fromId?: string,
  ): void;
  /** Spawn a projectile carrying `onHit` effects (run against whoever it hits).
   *  With `count` > 1 it fires a burst of that many shots `intervalMs` apart. */
  spawnProjectile(
    owner: EffectActor,
    vfx: string,
    dirX: number,
    dirZ: number,
    speed: number,
    range: number,
    radius: number,
    onHit: LeafEffect[],
    count?: number,
    intervalMs?: number,
    pierce?: boolean,
  ): void;
  /** Invoke `fn` for every living enemy of `exceptId` within `radius` of (x,z). */
  forEachEnemyInRadius(
    x: number,
    z: number,
    radius: number,
    exceptId: string,
    fn: (target: EffectActor) => void,
  ): void;
  /** Invoke `fn` for every living ALLY (same team as `caster`, excluding the
   *  caster) within `radius` of (x,z). */
  forEachAllyInRadius(
    x: number,
    z: number,
    radius: number,
    caster: EffectActor,
    fn: (target: EffectActor) => void,
  ): void;
  /** Detonate any interactive barrels within `radius` of (x,z), credited to `fromId`. */
  triggerBarrelsInRadius(x: number, z: number, radius: number, fromId: string): void;
  /** Physically shove any destructibles (tires/barrels/building parts) within
   *  `radius` of (x,z) outward, credited to `fromId`. No explosion — just a push;
   *  `amount` (the effect's damage) also chips drum HP. */
  pushDestructiblesInRadius(
    x: number,
    z: number,
    radius: number,
    fromId: string,
    amount: number,
  ): void;
  /** Damage any HP-bearing cover structures (trailers/cars/dumpsters) within
   *  `radius` of (x,z) — an AoE chips away at / crumbles them. */
  damageStructuresInRadius(x: number, z: number, radius: number, amount: number): void;
  /** After `delayMs` (the dash's travel time), resolve `onLand` as an AoE around
   *  the caster's landing position — a charge's slam. */
  scheduleDashImpact(caster: EffectActor, delayMs: number, radius: number, onLand: LeafEffect[]): void;
}

/** Where a cast is aimed — resolved by the room before the effects run. */
export interface CastContext {
  caster: EffectActor;
  /** Normalized facing/aim direction. */
  dirX: number;
  dirZ: number;
  /** Ground-target impact point (`aim:'point'`). */
  targetX?: number;
  targetZ?: number;
  /** Locked target (`aim:'unit'`); undefined falls back to the caster. */
  unitTarget?: EffectActor;
  /** The ability id being resolved — carried into damage so a Q-restricted
   *  empower applies only to its ability. */
  ability?: string;
}

/** The single-target frame a {@link LeafEffect} resolves against. */
interface LeafFrame {
  caster: EffectActor;
  target: EffectActor;
  /** Where the effect emanates from (for knockback direction). */
  originX: number;
  originZ: number;
  /** Ability id driving this damage (for empower restriction); undefined = none. */
  ability?: string;
}

/** Apply one leaf effect to its current target. The whole switch over leaf kinds
 *  lives here — one case per verb, added once. */
function runLeaf(effect: LeafEffect, frame: LeafFrame, rt: EffectRuntime): void {
  const { caster, target } = frame;
  switch (effect.type) {
    case 'damage':
      rt.dealDamage(target, effect.amount, caster.sessionId, frame.ability);
      break;
    case 'heal':
      rt.heal(target, effect.amount, caster.sessionId);
      break;
    case 'shield':
      rt.addShield(target, effect.amount, effect.durationMs, caster.sessionId);
      break;
    case 'status':
      rt.applyStatus(target, effect.status, caster.sessionId);
      break;
    case 'knockback': {
      let dx = target.x - frame.originX;
      let dz = target.z - frame.originZ;
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        dx /= len;
        dz /= len;
      } else {
        // Target sits on the origin — shove along the caster's facing instead.
        dx = caster.x === target.x && caster.z === target.z ? 0 : target.x - caster.x;
        dz = caster.x === target.x && caster.z === target.z ? 1 : target.z - caster.z;
        const l2 = Math.hypot(dx, dz) || 1;
        dx /= l2;
        dz /= l2;
      }
      rt.displace(target, dx, dz, effect.distance, effect.speed);
      break;
    }
  }
}

/** Total direct damage in a leaf list — what an AoE chips off cover structures. */
function sumLeafDamage(effects: LeafEffect[]): number {
  let total = 0;
  for (const e of effects) if (e.type === 'damage') total += e.amount;
  return total;
}

/** Run a list of leaf effects against a single target from a shared origin. */
function runLeaves(
  effects: LeafEffect[],
  caster: EffectActor,
  target: EffectActor,
  originX: number,
  originZ: number,
  rt: EffectRuntime,
  ability?: string,
): void {
  const frame: LeafFrame = { caster, target, originX, originZ, ability };
  for (const e of effects) runLeaf(e, frame, rt);
}

/**
 * Resolve a cast: dispatch each top-level effect. Containers (projectile/aoe)
 * deliver their `onHit` leaves to the targets they find; `dash` moves the
 * caster; a bare leaf lands on the cast's primary target (the unit-locked target
 * for `aim:'unit'`, else the caster — i.e. self-buffs/heals/shields).
 */
export function runCast(effects: Effect[], ctx: CastContext, rt: EffectRuntime): void {
  const { caster } = ctx;
  for (const effect of effects) {
    switch (effect.type) {
      case 'projectile':
        rt.spawnProjectile(
          caster,
          effect.vfx,
          ctx.dirX,
          ctx.dirZ,
          effect.speed,
          effect.range,
          effect.radius,
          effect.onHit,
          effect.count,
          effect.intervalMs,
          effect.pierce,
        );
        break;
      case 'aoe': {
        // Center the blast on the caster, the ground point, or the locked unit.
        const cx = effect.at === 'point' ? (ctx.targetX ?? caster.x) : effect.at === 'unit' ? (ctx.unitTarget?.x ?? caster.x) : caster.x;
        const cz = effect.at === 'point' ? (ctx.targetZ ?? caster.z) : effect.at === 'unit' ? (ctx.unitTarget?.z ?? caster.z) : caster.z;
        // Optional frontal arc: only hit targets within ±arc/2 of the cast
        // direction (a target on top of the caster always counts).
        const cosHalf = effect.arc !== undefined && effect.arc < 360 ? Math.cos((effect.arc * Math.PI) / 360) : -1;
        const fl = Math.hypot(ctx.dirX, ctx.dirZ) || 1;
        const fx = ctx.dirX / fl;
        const fz = ctx.dirZ / fl;
        rt.forEachEnemyInRadius(cx, cz, effect.radius, caster.sessionId, (target) => {
          if (cosHalf > -1) {
            const vx = target.x - cx;
            const vz = target.z - cz;
            const len = Math.hypot(vx, vz);
            if (len > 1e-3 && (vx * fx + vz * fz) / len < cosHalf) return; // behind the arc
          }
          runLeaves(effect.onHit, caster, target, cx, cz, rt, ctx.ability);
        });
        // Barrels caught in the blast launch + detonate too.
        rt.triggerBarrelsInRadius(cx, cz, effect.radius, caster.sessionId);
        // Destructibles in range get a physical shove (tires/barrels/wreckage)
        // and take the blast's damage (chipping drum HP toward destruction).
        rt.pushDestructiblesInRadius(cx, cz, effect.radius, caster.sessionId, sumLeafDamage(effect.onHit));
        // Cover structures (trailers/cars/dumpsters) take the blast's damage.
        rt.damageStructuresInRadius(cx, cz, effect.radius, sumLeafDamage(effect.onHit));
        break;
      }
      case 'heal_allies': {
        // The friendly counterpart to `aoe`: the caster always heals himself, and
        // same-team allies heal only if they're inside the burst ("if they get
        // hit"). Centre = caster / ground point / locked unit.
        const hx = effect.at === 'point' ? (ctx.targetX ?? caster.x) : effect.at === 'unit' ? (ctx.unitTarget?.x ?? caster.x) : caster.x;
        const hz = effect.at === 'point' ? (ctx.targetZ ?? caster.z) : effect.at === 'unit' ? (ctx.unitTarget?.z ?? caster.z) : caster.z;
        rt.heal(caster, effect.amount, caster.sessionId); // the priest always heals himself
        rt.forEachAllyInRadius(hx, hz, effect.radius, caster, (ally) => rt.heal(ally, effect.amount, caster.sessionId));
        break;
      }
      case 'dash':
        rt.displace(caster, ctx.dirX, ctx.dirZ, effect.distance, effect.speed, effect.damage, caster.sessionId);
        // A charge-style lunge slams where it lands: resolve the onLand effects
        // as an AoE once the dash completes (so it's centred on the end point).
        if (effect.onLand && effect.onLand.length) {
          const delayMs = (effect.distance / effect.speed) * 1000;
          rt.scheduleDashImpact(caster, delayMs, effect.impactRadius ?? 2.5, effect.onLand);
        }
        break;
      default:
        // A bare leaf: apply to the locked target (unit aim) or the caster.
        runLeaves([effect], caster, ctx.unitTarget ?? caster, caster.x, caster.z, rt, ctx.ability);
        break;
    }
  }
}
