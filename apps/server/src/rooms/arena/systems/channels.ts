import { PLAYER_RADIUS, isSilenced, isStunned, type AbilityDef } from '@arena/shared';
import type { Player } from '../../schema.js';
import type { ArenaContext } from '../context.js';
import { inBeam } from '../combatMath.js';
import { BARREL_RADIUS, type BarrelSystem } from './barrels.js';
import type { CombatSystem } from './combat.js';
import type { DestructibleSystem } from './destructibles.js';

/** Live state for one held beam channel (e.g. the priest's sustained beam). */
interface Channel {
  config: AbilityDef;
  /** Sim time (ms) the channel auto-ends. */
  endAt: number;
  /** Shared clock (ms) for the object-damage tick (first tick is immediate). */
  objTickAt: number;
  /** Per-enemy next-DoT-tick time; absence means "not currently in the beam"
   *  (so re-entering re-triggers the on-hit burst). */
  engaged: Map<string, number>;
}

/**
 * Beam channeling — held, swept abilities that damage everything in a capsule in
 * front of the caster over time (players, cover, barrels, destructibles). Owns
 * the per-caster channel state; the room drives it via {@link update} each tick
 * and {@link start}/{@link stop} from the ability + lifecycle handlers.
 *
 * A shared (non-mode-specific) gameplay system — built once for every
 * ability-mode arena, like {@link CombatSystem}/{@link ProjectileSystem}.
 */
export class ChannelSystem {
  /** Active channels keyed by caster session id. Aim direction lives on the
   *  replicated `Player.channelDir*`. */
  private readonly channels = new Map<string, Channel>();

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
    private readonly barrels: BarrelSystem,
    private readonly destructibles: DestructibleSystem,
  ) {}

  /** Is this caster currently holding a channel? */
  isActive(sessionId: string): boolean {
    return this.channels.has(sessionId);
  }

  /** Begin a channel for `config`, aimed along (dirX,dirZ). */
  start(sessionId: string, player: Player, config: AbilityDef, dirX: number, dirZ: number): void {
    player.channelAbility = config.id;
    player.channelDirX = dirX;
    player.channelDirZ = dirZ;
    this.channels.set(sessionId, {
      config,
      endAt: this.ctx.now() + (config.channelMs ?? 0),
      objTickAt: this.ctx.now(), // first object tick lands immediately
      engaged: new Map(),
    });
  }

  /** End a channel (timer elapsed, interrupted, CC'd, died, or left). */
  stop(sessionId: string): void {
    if (!this.channels.delete(sessionId)) return;
    const player = this.ctx.state.players.get(sessionId);
    if (player) player.channelAbility = '';
  }

  /** Per-tick channel processing: drop channels whose caster can no longer hold
   *  them (dead / stunned / silenced / elapsed). Enemies take damage the instant
   *  they enter the beam, then every `channelTickMs`; objects tick on a shared
   *  clock. */
  update(): void {
    const now = this.ctx.now();
    this.channels.forEach((ch, sessionId) => {
      const caster = this.ctx.state.players.get(sessionId);
      if (!caster || !caster.alive || isStunned(caster) || isSilenced(caster)) {
        this.stop(sessionId);
        return;
      }
      if (now >= ch.endAt) {
        this.stop(sessionId);
        return;
      }
      const config = ch.config;
      const tickMs = config.channelTickMs ?? 500;

      // Enemies: an on-hit burst on entry, then a per-target DoT. Tracked each
      // game tick so a swept-onto target is hit "as soon as it hits".
      this.ctx.state.players.forEach((target, tid) => {
        if (tid === sessionId || !target.alive) return;
        if (!inBeam(caster, target.x, target.z, PLAYER_RADIUS, config)) {
          ch.engaged.delete(tid); // left the beam — re-entering re-triggers on-hit
          return;
        }
        const next = ch.engaged.get(tid);
        if (next === undefined) {
          // Just entered: the immediate on-hit, then schedule its first DoT.
          this.combat.dealDamage(target, config.damage, sessionId);
          ch.engaged.set(tid, now + tickMs);
        } else if (now >= next) {
          this.combat.dealDamage(target, config.damage, sessionId);
          ch.engaged.set(tid, next + tickMs);
        }
      });
      // Prune engaged ids for players that left/died (forEach above handles those
      // still present; drop any no-longer-in-state ids).
      for (const id of [...ch.engaged.keys()]) {
        if (!this.ctx.state.players.get(id)?.alive) ch.engaged.delete(id);
      }

      // Objects: a shared 0.5s clock (first tick immediate), since they're static.
      while (now >= ch.objTickAt) {
        this.applyObjectDamage(caster, config);
        ch.objTickAt += tickMs;
      }
    });
  }

  /** Damage the objects inside the beam capsule — cover structures, barrels and
   *  destructibles (players are handled per-target in {@link update}). */
  private applyObjectDamage(caster: Player, config: AbilityDef): void {
    const dx = caster.channelDirX;
    const dz = caster.channelDirZ;
    // Cover structures (trailers / cars / dumpsters) in the beam take its damage.
    this.ctx.state.structures.forEach((s) => {
      if (!s.destroyed && inBeam(caster, s.x, s.z, s.radius, config)) {
        this.combat.damageStructure(s.id, config.damage, dx, dz);
      }
    });
    // Burning barrels caught in the beam are launched + detonated.
    this.ctx.state.barrels.forEach((b) => {
      if (b.alive && inBeam(caster, b.x, b.z, BARREL_RADIUS, config)) {
        this.barrels.trigger(b, dx, dz, caster.sessionId);
      }
    });
    // Oil drums / tires: shoved (and drums chipped) along the beam.
    this.destructibles.damageInBeam(
      caster.x,
      caster.z,
      dx,
      dz,
      config.range,
      (config.beamWidth ?? 0.6) / 2,
      caster.sessionId,
      config.damage,
    );
  }
}
