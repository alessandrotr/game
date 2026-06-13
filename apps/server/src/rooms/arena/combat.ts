import {
  PLAYER_RADIUS,
  RESPAWN_DELAY_MS,
  XP_PER_KILL,
  ServerMessage,
  damageTakenMultiplier,
  levelForXp,
  type AbilityDef,
  type LeafEffect,
  type StatusSpec,
} from '@arena/shared';
import { StatusEffect, type Barrel, type Player } from '../schema.js';
import { applyDamage, applyHeal } from '../../combat.js';
import { HIT_ONESHOT_MS } from '../../animation.js';
import { runCast, type CastContext, type EffectRuntime } from '../../abilities/executor.js';
import type { ArenaContext } from './context.js';
import type { ArenaMatch } from './match.js';
import type { ProjectileSystem } from './projectiles.js';
import type { BarrelSystem } from './barrels.js';
import type { DestructibleSystem } from './destructibles.js';

/**
 * Everything that resolves an ability's or attack's effect against the world:
 * damage (with vulnerability + shields), healing, shields, statuses, forced
 * displacement, and per-tick status processing. It also exposes the
 * {@link EffectRuntime} the data-driven ability executor calls back into — so
 * abilities never touch the room directly.
 */
export class CombatSystem {
  /** Set immediately after construction (the projectile system needs this system
   *  for on-hit resolution, so the two are wired up after both exist). */
  private projectiles!: ProjectileSystem;
  private barrels!: BarrelSystem;
  private destructibles!: DestructibleSystem;
  /** Pending charge-slam impacts: session id → when (sim ms) + the AoE to apply. */
  private readonly dashImpacts = new Map<
    string,
    { at: number; radius: number; onLand: LeafEffect[] }
  >();

  constructor(
    private readonly ctx: ArenaContext,
    private readonly match: ArenaMatch,
  ) {}

  attachProjectiles(projectiles: ProjectileSystem): void {
    this.projectiles = projectiles;
  }

  attachBarrels(barrels: BarrelSystem): void {
    this.barrels = barrels;
  }

  attachDestructibles(destructibles: DestructibleSystem): void {
    this.destructibles = destructibles;
  }

  /** Launch a struck barrel away from the hit (projectile / auto-attack). */
  triggerBarrel(barrel: Barrel, dirX: number, dirZ: number, fromId: string): void {
    this.barrels.trigger(barrel, dirX, dirZ, fromId);
  }

  /** Try to hit a destructible with a projectile at (px,pz). Returns true if a
   *  body was struck (the caller then consumes the projectile). */
  hitDestructible(
    px: number,
    pz: number,
    projR: number,
    dirX: number,
    dirZ: number,
    fromId: string,
  ): boolean {
    return this.destructibles.tryProjectileHit(px, pz, projR, dirX, dirZ, fromId);
  }

  /** Queue a dash's landing slam to resolve after its travel time elapses. */
  scheduleDashImpact(caster: Player, delayMs: number, radius: number, onLand: LeafEffect[]): void {
    this.dashImpacts.set(caster.sessionId, { at: this.ctx.now() + delayMs, radius, onLand });
  }

  /** Resolve any due dash slams as an AoE around the caster's (now landed)
   *  position. Called once per tick by the room. */
  processDashImpacts(): void {
    const now = this.ctx.now();
    this.dashImpacts.forEach((imp, sessionId) => {
      if (now < imp.at) return;
      this.dashImpacts.delete(sessionId);
      const caster = this.ctx.state.players.get(sessionId);
      if (!caster || !caster.alive) return;
      runCast(
        [{ type: 'aoe', at: 'caster', radius: imp.radius, onHit: imp.onLand }],
        { caster, dirX: 0, dirZ: 0 },
        this.effectRuntime,
      );
    });
  }

  /**
   * Apply an ability's effects via the data-driven executor (no per-ability
   * switch). Runs immediately for instant casts, or when a pending cast's
   * wind-up elapses.
   */
  resolveCast(
    player: Player,
    config: AbilityDef,
    dirX: number,
    dirZ: number,
    targetX?: number,
    targetZ?: number,
    unitTargetId?: string,
  ): void {
    const unitTarget = unitTargetId ? this.ctx.state.players.get(unitTargetId) : undefined;
    const cast: CastContext = { caster: player, dirX, dirZ, targetX, targetZ, unitTarget };
    runCast(config.effects, cast, this.effectRuntime);
  }

  /** Resolve a hit on a player: scale by vulnerability, drain any absorb shield,
   *  apply the remainder via the combat core, broadcast, and schedule respawn on
   *  a kill. */
  dealDamage(target: Player, amount: number, fromId: string): void {
    if (!target.alive || amount <= 0) return;
    const now = this.ctx.now();
    // Vulnerability (damage_amp) scales incoming damage; shields absorb first.
    let incoming = amount * damageTakenMultiplier(target);
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, incoming);
      target.shield -= absorbed;
      incoming -= absorbed;
      // Keep the shield status' lifetime in sync so it expires when emptied.
      if (target.shield <= 0) this.removeStatuses(target, 'shield');
    }
    if (incoming <= 0) return;

    const { applied, lethal } = applyDamage(target, incoming);
    if (applied <= 0) return;

    this.ctx.broadcast(ServerMessage.Damage, {
      from: fromId,
      to: target.sessionId,
      amount: applied,
      lethal,
    });

    if (lethal) {
      this.ctx.destinations.delete(target.sessionId);
      this.ctx.respawnAt.set(target.sessionId, now + RESPAWN_DELAY_MS);
      // Update live, replicated career totals (the HUD reads these; the DB delta
      // is flushed on leave). `fromId === target` is self-damage — no kill credit.
      const killer = fromId !== target.sessionId ? this.ctx.state.players.get(fromId) : undefined;
      if (killer) {
        const beforeLevel = killer.level;
        killer.kills += 1;
        killer.xp += XP_PER_KILL;
        killer.level = levelForXp(killer.xp);
        if (killer.level > beforeLevel) {
          this.ctx.broadcast(ServerMessage.LevelUp, {
            sessionId: killer.sessionId,
            level: killer.level,
          });
        }
      }
      target.deaths += 1;

      // Ranked match: the first team to the combined kill target wins.
      if (killer) this.match.recordKill(killer);
    } else {
      // Flinch — unless a cast/attack pose is already playing (don't cut it).
      const existing = this.ctx.animOneShots.get(target.sessionId);
      if (!existing || existing.until <= now) {
        this.ctx.animOneShots.set(target.sessionId, {
          name: 'hit',
          until: now + HIT_ONESHOT_MS,
        });
      }
    }
  }

  /** Heal a target and broadcast the healing feedback. */
  healTarget(target: Player, amount: number): void {
    const healed = applyHeal(target, amount);
    if (healed > 0)
      this.ctx.broadcast(ServerMessage.Heal, { to: target.sessionId, amount: healed });
  }

  /** Grant (or refresh) an absorb shield. Last shield wins — simple and enough
   *  for the current kits; a stacking model can come later. */
  addShield(target: Player, amount: number, durationMs: number, fromId: string): void {
    if (amount <= 0 || !target.alive) return;
    this.removeStatuses(target, 'shield');
    target.shield = amount;
    this.applyStatus(target, { kind: 'shield', durationMs, magnitude: amount }, fromId);
  }

  /** Apply (or refresh) a status on a target. A new status of the same kind
   *  replaces the old one (re-applying refreshes its duration). */
  applyStatus(target: Player, spec: StatusSpec, fromId: string): void {
    if (!target.alive || spec.durationMs <= 0) return;
    const now = this.ctx.now();
    this.removeStatuses(target, spec.kind);
    const s = new StatusEffect();
    s.kind = spec.kind;
    s.expiresAt = now + spec.durationMs;
    s.magnitude = spec.magnitude ?? 0;
    s.tickMs = spec.tickMs ?? 0;
    s.tickAmount = spec.tickAmount ?? 0;
    s.nextTickAt = spec.tickMs ? now + spec.tickMs : 0;
    s.sourceId = fromId;
    target.statuses.push(s);
    // A stun/root cancels in-progress movement so it reads as a hard stop.
    if (spec.kind === 'stun' || spec.kind === 'root')
      this.ctx.destinations.delete(target.sessionId);
    if (spec.kind === 'stun') this.ctx.attackTargets.delete(target.sessionId);
  }

  /** Drop every active status of `kind` from a target. */
  removeStatuses(target: Player, kind: StatusEffect['kind']): void {
    for (let i = target.statuses.length - 1; i >= 0; i--) {
      if (target.statuses[i]?.kind === kind) target.statuses.splice(i, 1);
    }
  }

  /** Begin a forced displacement (dash / knockback): a constant-velocity slide
   *  for `distance / speed` seconds that overrides locomotion while active. */
  displace(entity: Player, dirX: number, dirZ: number, distance: number, speed: number): void {
    if (speed <= 0 || distance <= 0) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.ctx.displacements.set(entity.sessionId, {
      vx: (dirX / len) * speed,
      vz: (dirZ / len) * speed,
      until: this.ctx.now() + (distance / speed) * 1000,
    });
    // A displacement overrides a pending move order.
    this.ctx.destinations.delete(entity.sessionId);
  }

  /** Per-tick status processing: prune expired statuses, tick dot/hot, and clear
   *  an emptied shield. Runs once per living player each tick. */
  updateStatuses(player: Player): void {
    const now = this.ctx.now();
    const list = player.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s) continue;
      if (now >= s.expiresAt) {
        if (s.kind === 'shield') player.shield = 0;
        list.splice(i, 1);
        continue;
      }
      if ((s.kind === 'dot' || s.kind === 'hot') && s.tickMs > 0 && now >= s.nextTickAt) {
        if (s.kind === 'dot') this.dealDamage(player, s.tickAmount, s.sourceId);
        else this.healTarget(player, s.tickAmount);
        s.nextTickAt += s.tickMs;
      }
    }
  }

  /** Invoke `fn` for every living enemy of `exceptId` within `radius` of (x, z).
   *  The single AoE target-selection used by the effect executor. */
  forEachEnemyInRadius(
    x: number,
    z: number,
    radius: number,
    exceptId: string,
    fn: (target: Player) => void,
  ): void {
    const hitSq = (radius + PLAYER_RADIUS) * (radius + PLAYER_RADIUS);
    this.ctx.state.players.forEach((target, id) => {
      if (id === exceptId || !target.alive) return;
      const dx = target.x - x;
      const dz = target.z - z;
      if (dx * dx + dz * dz <= hitSq) fn(target);
    });
  }

  /** The executor's view of the world — every ability side effect funnels through
   *  these hooks (declared once; abilities never touch this). */
  readonly effectRuntime: EffectRuntime = {
    dealDamage: (t, a, f) => this.dealDamage(t, a, f),
    heal: (t, a) => this.healTarget(t, a),
    addShield: (t, a, d, f) => this.addShield(t, a, d, f),
    applyStatus: (t, s, f) => this.applyStatus(t, s, f),
    displace: (e, dx, dz, dist, sp) => this.displace(e, dx, dz, dist, sp),
    spawnProjectile: (o, v, dx, dz, sp, r, rad, oh) =>
      this.projectiles.spawnProjectile(o, v, dx, dz, sp, r, rad, oh),
    forEachEnemyInRadius: (x, z, r, ex, fn) => this.forEachEnemyInRadius(x, z, r, ex, fn),
    triggerBarrelsInRadius: (x, z, r, from) => this.barrels.triggerInRadius(x, z, r, from),
    pushDestructiblesInRadius: (x, z, r, from) => this.destructibles.pushInRadius(x, z, r, from),
    scheduleDashImpact: (c, d, r, onLand) => this.scheduleDashImpact(c, d, r, onLand),
  };
}
