import {
  ABILITIES,
  PLAYER_RADIUS,
  RESPAWN_DELAY_MS,
  XP_PER_KILL,
  ZOMBIE_XP_PER_KILL,
  ZOMBIE_SPRINTER_XP,
  ZOMBIE_FAT_XP,
  ZOMBIE_MINIBOSS_XP,
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_FAT_SKIN_ID,
  ZOMBIE_MINIBOSS_SKIN_ID,
  isZombieSkin,
  BUFF_TRAP_DAMAGE_MULT,
  ServerMessage,
  damageTakenMultiplier,
  levelForXp,
  xpForLevel,
  type AbilityDef,
  type AbilityKind,
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
import type { CoverSystem } from './cover.js';

/** XP awarded for killing a single (non-miniboss) zombie, by variant. Mini-boss
 *  rewards are team-wide and handled separately. */
function zombieKillXp(skinId: string): number {
  if (skinId === ZOMBIE_SPRINTER_SKIN_ID) return ZOMBIE_SPRINTER_XP;
  if (skinId === ZOMBIE_FAT_SKIN_ID) return ZOMBIE_FAT_XP;
  return ZOMBIE_XP_PER_KILL;
}

/** Synthetic "ability" ids for perk-sourced damage that is itself a perk effect
 *  (reflect, the Colossus aura, the Archmage burn tick). Damage tagged with one
 *  of these is inert: it is NOT scaled by ability power, can't crit, and never
 *  re-procs on-hit perks (lightning / poison / burn) — otherwise an aura ticking
 *  every second on a horde would cascade procs without bound. */
const INTERNAL_PERK_DAMAGE = new Set<string>(['reflect', 'aura', 'burn']);

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
  private cover!: CoverSystem;
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

  attachCover(cover: CoverSystem): void {
    this.cover = cover;
  }

  /** Damage a cover structure by id (auto-attack / melee). `(dirX,dirZ)` is the
   *  hit direction — shoves a car along it (ignored by static cover). */
  damageStructure(id: string, amount: number, dirX = 0, dirZ = 0): void {
    this.cover.damage(id, amount, dirX, dirZ);
  }

  /** Damage the first alive cover structure a projectile at (x,z) overlaps.
   *  `(dirX,dirZ)` is the projectile's travel direction (shoves cars). Returns
   *  true if one was hit (the caller consumes the projectile). */
  hitStructure(x: number, z: number, projR: number, amount: number, dirX = 0, dirZ = 0): boolean {
    return this.cover.hitProjectile(x, z, projR, amount, dirX, dirZ);
  }

  /** Launch a struck barrel away from the hit (projectile / auto-attack). */
  triggerBarrel(barrel: Barrel, dirX: number, dirZ: number, fromId: string): void {
    this.barrels.trigger(barrel, dirX, dirZ, fromId);
  }

  /** Detonate/launch every burning barrel within `radius` of (x,z). */
  triggerBarrelsInRadius(x: number, z: number, radius: number, fromId: string): void {
    this.barrels.triggerInRadius(x, z, radius, fromId);
  }

  /** Damage every cover structure within `radius` of (x,z). */
  damageStructuresInRadius(x: number, z: number, radius: number, amount: number): void {
    this.cover.damageInRadius(x, z, radius, amount);
  }

  /** Shove (and chip) every destructible drum/tire within `radius` of (x,z). */
  pushDestructiblesInRadius(
    x: number,
    z: number,
    radius: number,
    fromId: string,
    amount = 0,
  ): void {
    this.destructibles.pushInRadius(x, z, radius, fromId, amount);
  }

  /** Pull every destructible drum/tire toward the vortex center. */
  pullDestructibles(vortexX: number, vortexZ: number, pullRadius: number): void {
    this.destructibles.pull(vortexX, vortexZ, pullRadius);
  }

  /** Pull every explosive barrel toward the vortex center. */
  pullBarrels(vortexX: number, vortexZ: number, pullRadius: number): void {
    this.barrels.pull(vortexX, vortexZ, pullRadius);
  }

  /** Pull every movable car toward the vortex center. */
  pullCars(vortexX: number, vortexZ: number, pullRadius: number): void {
    this.cover.pullCars(vortexX, vortexZ, pullRadius);
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
    amount = 0,
  ): boolean {
    return this.destructibles.tryProjectileHit(px, pz, projR, dirX, dirZ, fromId, amount);
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
    aoeSizeBonus?: number,
  ): void {
    const unitTarget = unitTargetId ? this.ctx.state.players.get(unitTargetId) : undefined;
    const cast: CastContext = {
      caster: player,
      dirX,
      dirZ,
      targetX,
      targetZ,
      unitTarget,
      ability: config.id,
      aoeSizeBonus,
    };
    runCast(config.effects, cast, this.effectRuntime);
  }

  /** Resolve a hit on a player: scale by vulnerability, drain any absorb shield,
   *  apply the remainder via the combat core, broadcast, and schedule respawn on
   *  a kill. `ability` (the source ability id) lets a restricted empower apply
   *  only to its ability. */
  dealDamage(target: Player, amount: number, fromId: string, ability?: string): void {
    if (!target.alive || amount <= 0) return;
    // Zombie mode has no friendly fire: a human's hit (ability, thrown molotov,
    // dash) never harms a fellow human — only zombies take a player's damage, and
    // only humans take a zombie's. A blast with no player source (neutral car
    // explosion) has no attacker here, so it still hits anyone.
    if (this.ctx.state.zombieMode) {
      const attacker = fromId ? this.ctx.state.players.get(fromId) : undefined;
      if (attacker && (isZombieSkin(attacker.skinId) === isZombieSkin(target.skinId))) return;
    }
    const now = this.ctx.now();
    // Perk-sourced "inert" damage (reflect / aura / burn) bypasses all attacker
    // scaling and on-hit procs so it can't snowball into itself.
    const isInternal = ability !== undefined && INTERNAL_PERK_DAMAGE.has(ability);
    // An `empower` buff on the attacker adds flat damage to this one hit, then is
    // consumed (the archer's Tumble = any next hit; the priest's Blessing = Q only).
    const total = amount + (isInternal ? 0 : this.consumeEmpower(fromId, target.sessionId, ability));
    // Perk modifiers: attacker's ability damage bonus + target's damage reduction.
    const attackerPerks = this.ctx.perkModifiers(fromId);
    const targetPerks = this.ctx.perkModifiers(target.sessionId);
    const attacker = fromId ? this.ctx.state.players.get(fromId) : undefined;
    let lowHpDamageMult = 1.0;
    if (!isInternal && attacker && attacker.alive && attacker.maxHp > 0 && attacker.hp / attacker.maxHp < 0.40) {
      lowHpDamageMult = attackerPerks.lowHpDamageMult;
    }

    // Critical Hits
    let isCrit = false;
    let critMult = 1.0;
    if (!isInternal && attacker && attackerPerks.critChance > 0) {
      if (Math.random() < attackerPerks.critChance) {
        isCrit = true;
        critMult = attackerPerks.critMultiplier;

        // Cooldown reset chance
        if (attackerPerks.critCooldownResetChance > 0 && Math.random() < attackerPerks.critCooldownResetChance) {
          if (ability) {
            this.ctx.resetCooldowns?.(attacker.sessionId, ability);
          }
        }
      }
    }

    let aoeDamageMult = 1.0;
    if (ability && ABILITIES[ability as AbilityKind]?.aoeRadius !== undefined && ABILITIES[ability as AbilityKind].aoeRadius! > 0) {
      aoeDamageMult = attackerPerks.aoeDamageMult;
    }

    const abilityDamageMult = isInternal ? 1 : attackerPerks.abilityDamageMult;
    // A `buff` status on the attacker amps outgoing ability damage — but not
    // inert perk damage (reflect / aura / burn), which never scales.
    const buffMult =
      !isInternal && attacker && attacker.statuses.some((s) => s.kind === 'buff') ? BUFF_TRAP_DAMAGE_MULT : 1.0;
    const perkScaled =
      total * abilityDamageMult * aoeDamageMult * critMult * targetPerks.damageTakenMult * lowHpDamageMult * buffMult;
    // Vulnerability (damage_amp) scales incoming damage; shields absorb first.
    let incoming = perkScaled * damageTakenMultiplier(target);
    if (ability === 'molotov_fire' && !fromId && !isZombieSkin(target.skinId)) {
      incoming *= 0.4; // 60% less damage from the fire trap
    }
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

    // Static / Chain Lightning perk on hit (prevent infinite recursion using ability restriction)
    if (
      !isInternal &&
      attacker &&
      attackerPerks.lightningChance > 0 &&
      attacker.alive &&
      target.sessionId !== attacker.sessionId &&
      ability !== 'lightning_spark'
    ) {
      if (Math.random() < attackerPerks.lightningChance) {
        // Find other enemies around target
        const list: Player[] = [];
        this.forEachEnemyInRadius(target.x, target.z, 5.0, attacker.sessionId, (otherEnemy) => {
          if (otherEnemy.sessionId !== target.sessionId && this.isProcTarget(otherEnemy)) {
            list.push(otherEnemy);
          }
        });
        // Sort by distance to the target zombie
        list.sort((a, b) => {
          const da = Math.hypot(a.x - target.x, a.z - target.z);
          const db = Math.hypot(b.x - target.x, b.z - target.z);
          return da - db;
        });
        // Chain to up to N targets
        const targetsToHit = list.slice(0, attackerPerks.lightningTargets);
        targetsToHit.forEach((t) => {
          this.dealDamage(t, attackerPerks.lightningDamage, attacker.sessionId, 'lightning_spark');
          if (attackerPerks.lightningStunMs > 0) {
            this.applyStatus(t, { kind: 'stun', durationMs: attackerPerks.lightningStunMs }, attacker.sessionId);
          }
        });
      }
    }

    // Poison perk on hit
    if (
      !isInternal &&
      attacker &&
      attackerPerks.poisonDurationMs > 0 &&
      attacker.alive &&
      target.sessionId !== attacker.sessionId &&
      ability &&
      ability !== 'lightning_spark' &&
      ability !== 'chain_explosion' &&
      ability !== 'poison_dot'
    ) {
      this.applyStatus(target, {
        kind: 'poison',
        durationMs: attackerPerks.poisonDurationMs,
        tickMs: 1000,
        tickAmount: attackerPerks.poisonDamagePerSecond,
        ability: 'poison_dot',
      }, attacker.sessionId);

      // Plague perk: spreads poison to other zombies in a 1.5 radius of the hit
      if (attackerPerks.poisonSpreadRadius > 0) {
        this.forEachEnemyInRadius(target.x, target.z, attackerPerks.poisonSpreadRadius, attacker.sessionId, (otherEnemy) => {
          if (otherEnemy.sessionId !== target.sessionId && this.isProcTarget(otherEnemy)) {
            this.applyStatus(otherEnemy, {
              kind: 'poison',
              durationMs: attackerPerks.poisonDurationMs,
              tickMs: 1000,
              tickAmount: attackerPerks.poisonDamagePerSecond,
              ability: 'poison_dot',
            }, attacker.sessionId);
          }
        });
      }
    }

    // Archmage burn: a real ability hit leaves a flat burn DoT (a `dot` status
    // ticking `abilityBurnDamage` once per second). Gated to registry abilities so
    // perk-sourced damage (lightning / poison / reflect / aura, none of which are
    // in ABILITIES) can't seed or refresh it.
    if (
      attacker &&
      attackerPerks.abilityBurnDamage > 0 &&
      attacker.alive &&
      target.sessionId !== attacker.sessionId &&
      ability &&
      ABILITIES[ability as AbilityKind]
    ) {
      this.applyStatus(target, {
        kind: 'dot',
        durationMs: attackerPerks.abilityBurnDurationMs,
        tickMs: 1000,
        tickAmount: attackerPerks.abilityBurnDamage,
        ability: 'burn',
      }, attacker.sessionId);
    }

    // Broadcast the Damage feedback. For zombies, the client plays a blood splash
    // and flinch without showing floating text, ensuring high performance.
    this.ctx.broadcast(ServerMessage.Damage, {
      from: fromId,
      to: target.sessionId,
      amount: applied,
      lethal,
      ability,
      crit: isCrit,
    });


    if (lethal) {
      this.ctx.destinations.delete(target.sessionId);
      this.ctx.respawnAt.set(target.sessionId, now + RESPAWN_DELAY_MS);
      // Update live, replicated career totals (the HUD reads these; the DB delta
      // is flushed on leave). `fromId === target` is self-damage — no kill credit.
      const killer = fromId !== target.sessionId ? this.ctx.state.players.get(fromId) : undefined;
      if (killer) {
        // Record kill for perks (e.g. Overclock)
        this.ctx.recordKill?.(killer.sessionId);

        // Infinite Power: zombie kills refund flat mana to the killer.
        if (attackerPerks.manaPerKill > 0 && killer.alive) {
          killer.mana = Math.min(killer.maxMana, killer.mana + attackerPerks.manaPerKill);
        }

        // A zombie is a wave enemy, not a PvP kill: it grants reduced XP and
        // does NOT count toward the killer's kill tally (so it never inflates
        // career/scoreboard kills).
        const isZombieKill = isZombieSkin(target.skinId);

        // AoE chain-explosion logic. In zombie mode it's a zombie-kill payoff; in
        // the FFA arena it triggers on any AoE kill so the perk is testable there.
        if ((isZombieKill || !this.ctx.state.zombieMode) && attackerPerks.chainExplosionChance > 0) {
          const isAoe = ability && ABILITIES[ability as AbilityKind]?.aoeRadius !== undefined && ABILITIES[ability as AbilityKind].aoeRadius! > 0;
          if (isAoe && Math.random() < attackerPerks.chainExplosionChance) {
            const explosionRadius = 4 + attackerPerks.aoeSizeBonus;
            const explosionDamage = 40;

            // Trigger explosion visuals
            this.ctx.broadcast(ServerMessage.Detonation, {
              kind: 'chain_explosion',
              x: target.x,
              z: target.z,
              radius: explosionRadius,
            });

            // Find other enemies around the dead zombie's position and deal damage
            const list: Player[] = [];
            this.forEachEnemyInRadius(target.x, target.z, explosionRadius, killer.sessionId, (otherEnemy) => {
              if (otherEnemy.sessionId !== target.sessionId) {
                list.push(otherEnemy);
              }
            });

            list.forEach((otherEnemy) => {
              this.dealDamage(otherEnemy, explosionDamage, killer.sessionId, 'chain_explosion');
            });
          }
        }

        if (!isZombieKill) {
          killer.kills += 1;
          this.grantXp(killer, XP_PER_KILL);
        } else if (target.skinId === ZOMBIE_MINIBOSS_SKIN_ID) {
          // A Mini-Boss is a shared objective: every living member of the
          // killer's team (including the killer) earns the full bounty.
          this.ctx.state.players.forEach((member) => {
            if (member.team === killer.team && !isZombieSkin(member.skinId)) {
              this.grantXp(member, ZOMBIE_MINIBOSS_XP);
            }
          });
        } else {
          this.grantXp(killer, zombieKillXp(target.skinId));
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

  /** DEV: bump a player up `n` levels by granting exactly the XP needed, so the
   *  normal level-up broadcast + VFX fire. */
  devAddLevels(player: Player, n: number): void {
    const target = player.level + Math.max(1, Math.floor(n));
    this.grantXp(player, Math.max(0, xpForLevel(target) - player.xp));
  }

  /** Grant `amount` XP to a player, recompute their level, and broadcast a
   *  level-up if it rose. The single path all kill rewards funnel through. */
  private grantXp(player: Player, amount: number): void {
    const beforeLevel = player.level;
    player.xp += amount;
    player.level = levelForXp(player.xp);
    if (player.level > beforeLevel) {
      this.ctx.broadcast(ServerMessage.LevelUp, {
        sessionId: player.sessionId,
        level: player.level,
      });
    }
  }

  /** Flat bonus damage from an `empower` buff on the attacker, consumed on use.
   *  A restricted empower (`status.ability` set) applies only when `ability`
   *  matches; an unrestricted one applies to any hit. Returns 0 otherwise. */
  private consumeEmpower(fromId: string, targetId: string, ability?: string): number {
    if (fromId === targetId) return 0;
    const attacker = this.ctx.state.players.get(fromId);
    if (!attacker) return 0;
    for (const s of attacker.statuses) {
      if (s.kind === 'empower' && (s.ability === '' || s.ability === ability)) {
        const bonus = s.magnitude;
        this.removeStatuses(attacker, 'empower');
        return bonus;
      }
    }
    return 0;
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

    // Friendly fire CC check in Zombie Mode
    if (this.ctx.state.zombieMode && fromId) {
      const attacker = this.ctx.state.players.get(fromId);
      if (attacker && (isZombieSkin(attacker.skinId) === isZombieSkin(target.skinId))) {
        if (spec.kind === 'stun' || spec.kind === 'root' || spec.kind === 'slow' || spec.kind === 'silence') {
          return;
        }
      }
    }

    // Stun immunity check
    if (spec.kind === 'stun') {
      const targetPerks = this.ctx.perkModifiers(target.sessionId);
      const isLowHpStunImmune = targetPerks.lowHpStunImmune && (target.maxHp > 0 && target.hp / target.maxHp < 0.40);
      if (targetPerks.stunImmune || isLowHpStunImmune) {
        return;
      }
    }

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
    s.ability = spec.ability ?? '';
    target.statuses.push(s);
    // A stun/root cancels in-progress movement so it reads as a hard stop.
    if (spec.kind === 'stun' || spec.kind === 'root')
      this.ctx.destinations.delete(target.sessionId);
    if (spec.kind === 'stun' && !isZombieSkin(target.skinId)) {
      this.ctx.attackTargets.delete(target.sessionId);
    }
  }

  /** Drop every active status of `kind` from a target. */
  removeStatuses(target: Player, kind: StatusEffect['kind']): void {
    for (let i = target.statuses.length - 1; i >= 0; i--) {
      if (target.statuses[i]?.kind === kind) target.statuses.splice(i, 1);
    }
  }

  /** Begin a forced displacement (dash / knockback): a constant-velocity slide
   *  for `distance / speed` seconds that overrides locomotion while active. */
  displace(
    entity: Player,
    dirX: number,
    dirZ: number,
    distance: number,
    speed: number,
    damage?: number,
    fromId?: string,
  ): void {
    if (speed <= 0 || distance <= 0) return;
    if (this.ctx.state.zombieMode && fromId && entity.sessionId !== fromId) {
      const attacker = this.ctx.state.players.get(fromId);
      if (attacker && !isZombieSkin(attacker.skinId) && !isZombieSkin(entity.skinId)) {
        return;
      }
    }
    const len = Math.hypot(dirX, dirZ) || 1;
    this.ctx.displacements.set(entity.sessionId, {
      vx: (dirX / len) * speed,
      vz: (dirZ / len) * speed,
      until: this.ctx.now() + (distance / speed) * 1000,
      // Damaging dash: carry the per-enemy hit so the tick loop can sweep it.
      ...(damage ? { damage, fromId: fromId ?? entity.sessionId, hit: new Set<string>() } : {}),
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
      if ((s.kind === 'dot' || s.kind === 'poison' || s.kind === 'hot' || s.kind === 'field') && s.tickMs > 0 && now >= s.nextTickAt) {
        if (s.kind === 'dot' || s.kind === 'poison') {
          // Carry the status' own ability tag (e.g. 'burn', 'poison_dot') so the
          // tick is treated as inert perk damage and can't re-proc on-hit perks.
          this.dealDamage(player, s.tickAmount, s.sourceId, s.ability || (s.kind === 'poison' ? 'poison_dot' : undefined));
        } else if (s.kind === 'hot') {
          this.healTarget(player, s.tickAmount);
        } else {
          // `field`: a damaging aura — tick every enemy within `magnitude` of the
          // carrier (it follows the player, so the field tracks them).
          this.forEachEnemyInRadius(player.x, player.z, s.magnitude, player.sessionId, (enemy) =>
            this.dealDamage(enemy, s.tickAmount, player.sessionId),
          );
        }
        s.nextTickAt += s.tickMs;
      }
    }
  }

  /** Whether `p` is a valid secondary-proc target (lightning chain / poison
   *  spread). In zombie mode that means an actual zombie — never a fellow human;
   *  in the FFA arena any other combatant the proc reaches qualifies, so the
   *  perks are testable without zombies around. */
  private isProcTarget(p: Player): boolean {
    return !this.ctx.state.zombieMode || isZombieSkin(p.skinId);
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
    this.ctx.state.players.forEach((target, id) => {
      if (id === exceptId || !target.alive) return;
      const dx = target.x - x;
      const dz = target.z - z;
      const entityRadius = target.skinId === 'skin.zombie.miniboss' ? 0.8 : PLAYER_RADIUS;
      const hitSq = (radius + entityRadius) * (radius + entityRadius);
      if (dx * dx + dz * dz <= hitSq) fn(target);
    });
  }

  /** Invoke `fn` for every living ALLY (same team as `caster`, excluding the
   *  caster) within `radius` of (x, z) — used by friendly AoE heals. */
  forEachAllyInRadius(
    x: number,
    z: number,
    radius: number,
    caster: Player,
    fn: (target: Player) => void,
  ): void {
    this.ctx.state.players.forEach((target, id) => {
      if (id === caster.sessionId || !target.alive || target.team !== caster.team) return;
      const dx = target.x - x;
      const dz = target.z - z;
      const entityRadius = target.skinId === 'skin.zombie.miniboss' ? 0.8 : PLAYER_RADIUS;
      const hitSq = (radius + entityRadius) * (radius + entityRadius);
      if (dx * dx + dz * dz <= hitSq) fn(target);
    });
  }

  /** The executor's view of the world — every ability side effect funnels through
   *  these hooks (declared once; abilities never touch this). */
  readonly effectRuntime: EffectRuntime = {
    dealDamage: (t, a, f, ab) => this.dealDamage(t, a, f, ab),
    heal: (t, a) => this.healTarget(t, a),
    addShield: (t, a, d, f) => this.addShield(t, a, d, f),
    applyStatus: (t, s, f) => this.applyStatus(t, s, f),
    displace: (e, dx, dz, dist, sp, dmg, from) => this.displace(e, dx, dz, dist, sp, dmg, from),
    spawnProjectile: (o, v, dx, dz, sp, r, rad, oh, count, interval, pierce) =>
      this.projectiles.spawnProjectile(o, v, dx, dz, sp, r, rad, oh, count, interval, pierce),
    forEachEnemyInRadius: (x, z, r, ex, fn) => this.forEachEnemyInRadius(x, z, r, ex, fn),
    forEachAllyInRadius: (x, z, r, caster, fn) => this.forEachAllyInRadius(x, z, r, caster, fn),
    triggerBarrelsInRadius: (x, z, r, from) => this.barrels.triggerInRadius(x, z, r, from),
    pushDestructiblesInRadius: (x, z, r, from, amount) =>
      this.destructibles.pushInRadius(x, z, r, from, amount),
    damageStructuresInRadius: (x, z, r, amount) => this.cover.damageInRadius(x, z, r, amount),
    scheduleDashImpact: (c, d, r, onLand) => this.scheduleDashImpact(c, d, r, onLand),
  };
}
