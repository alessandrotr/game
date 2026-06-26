import {
  ARENA_HALF_SIZE,
  AUTO_ATTACKS,
  CLASS_LOADOUTS,
  PLAYER_RADIUS,
  isRooted,
  isStunned,
  type AbilityDef,
  type AbilityKind,
  type BotDifficulty,
  type CharacterClass,
  type ClientMessage,
  type ClientMessagePayloads,
} from '@arena/shared';
import type { Player } from '../../schema.js';
import type { ArenaContext } from '../context.js';

/** A bot cast reuses the exact client cast contract — it funnels through the
 *  room's `handleCast`, so it gets the same validation / broadcast / wind-up. */
type CastMessage = ClientMessagePayloads[ClientMessage.CastAbility];

/** What the room must expose for bots to act as if they were clients. The maps
 *  are shared by reference (like {@link ArenaContext}), so writes here are seen
 *  by the tick loop the same tick. */
export interface BotHooks {
  /** Per-bot, per-ability cooldown expiry (sim ms) — read to gate ability picks. */
  readonly cooldowns: Map<string, Partial<Record<AbilityKind, number>>>;
  /** Bots mid wind-up are skipped (the sim resolves their pending cast). */
  readonly pendingCasts: { has(id: string): boolean };
  /** Issue a cast for a bot (wraps the room's `handleCast`). */
  cast(botId: string, message: CastMessage): void;
}

/** The AI "intelligence" of a single bot. Tiers clone one of {@link PROFILES}. */
export interface BotProfile {
  difficulty: BotDifficulty;
  /** Min ms between ability/positioning re-decisions (lower = snappier). */
  decisionIntervalMs: number;
  /** Gaussian-ish angular noise added to skillshot aim (rad; ~0 = perfect). */
  aimErrorRad: number;
  /** Whether the bot uses its class kit at all (false = auto-attack only). */
  useAbilities: boolean;
  /** Ranged kiting: keep distance, strike when spaced, flee when crowded. */
  kite: boolean;
  /** Target the lowest-HP enemy (focus fire) rather than the nearest. */
  focusLowestHp: boolean;
  /** HP fraction below which the bot prioritises heals/shields and retreats
   *  (0 disables self-preservation). */
  retreatAtHpFrac: number;
  /** Hesitation (ms) before acting on a freshly acquired target. */
  reactionDelayMs: number;
  // --- Per-bot scheduler state (mutated as the bot runs) ---
  nextDecisionAt: number;
  engagedTargetId: string;
}

/** Static knobs per difficulty tier. Edit here to retune the whole roster. */
const PROFILES: Record<BotDifficulty, Omit<BotProfile, 'nextDecisionAt' | 'engagedTargetId'>> = {
  easy: {
    difficulty: 'easy',
    decisionIntervalMs: 550,
    aimErrorRad: 0.38,
    useAbilities: false,
    kite: false,
    focusLowestHp: false,
    retreatAtHpFrac: 0,
    reactionDelayMs: 450,
  },
  medium: {
    difficulty: 'medium',
    decisionIntervalMs: 280,
    aimErrorRad: 0.16,
    useAbilities: true,
    kite: false,
    focusLowestHp: false,
    retreatAtHpFrac: 0.2,
    reactionDelayMs: 200,
  },
  hard: {
    difficulty: 'hard',
    decisionIntervalMs: 130,
    aimErrorRad: 0.03,
    useAbilities: true,
    kite: true,
    focusLowestHp: true,
    retreatAtHpFrac: 0.3,
    reactionDelayMs: 60,
  },
};

/** A fresh AI profile for a bot at the given difficulty. */
export function makeBotProfile(difficulty: BotDifficulty): BotProfile {
  return { ...PROFILES[difficulty], nextDecisionAt: 0, engagedTargetId: '' };
}

/**
 * A zombie's AI: a relentless melee chaser. It never kites, never flees, never
 * uses abilities and reacts instantly — it just locks onto the nearest player
 * and closes the distance until it's in striking range, then auto-attacks. The
 * room drives the rest (the existing chase + auto-attack path); this profile
 * only strips out everything a zombie shouldn't do.
 */
export function makeZombieProfile(): BotProfile {
  return {
    difficulty: 'hard', // reuse the tier type; the flags below define behaviour
    decisionIntervalMs: 200,
    aimErrorRad: 0,
    useAbilities: false,
    kite: false,
    focusLowestHp: false,
    retreatAtHpFrac: 0,
    reactionDelayMs: 0,
    nextDecisionAt: 0,
    engagedTargetId: '',
  };
}

/** What an ability is *for*, derived from its effects so the picker stays
 *  data-driven (no per-ability switch). */
type AbilityRole = 'offense' | 'heal' | 'shield' | 'mobility';

/**
 * Drives every practice bot each tick. It is purely a *decision writer*: it
 * reads the world from {@link ArenaContext} and expresses intent by writing the
 * same seams a human client would — `attackTargets` / `destinations` and casts
 * via {@link BotHooks.cast}. All actual movement, collision, damage, projectile,
 * status and respawn logic is the room's existing simulation, unchanged.
 */
export class BotDirector {
  /** Effective-ability cache by class (built lazily; tuning is per-room-static
   *  enough for AI decisions — we don't need live re-reads mid-match). */
  private readonly roleCache = new Map<AbilityKind, AbilityRole>();

  constructor(
    private readonly ctx: ArenaContext,
    private readonly hooks: BotHooks,
  ) {}

  /** Run the AI for every registered bot. Called once at the top of the room's
   *  tick, before the per-player simulation consumes the maps we set. */
  update(now: number, bots: ReadonlyMap<string, BotProfile>): void {
    bots.forEach((profile, id) => this.updateBot(id, profile, now));
  }

  private updateBot(id: string, profile: BotProfile, now: number): void {
    const bot = this.ctx.state.players.get(id);
    if (!bot || !bot.alive) {
      this.ctx.attackTargets.delete(id);
      this.ctx.destinations.delete(id);
      return;
    }
    // Mid wind-up or stunned: the sim is in control; don't fight it.
    if (this.hooks.pendingCasts.has(id) || isStunned(bot)) return;

    const target = this.acquireTarget(bot, profile);
    if (!target) {
      // Nobody to fight — stand down.
      this.ctx.attackTargets.delete(id);
      this.ctx.destinations.delete(id);
      profile.engagedTargetId = '';
      return;
    }

    // Reaction time: hesitate briefly when switching to a new target.
    if (target.sessionId !== profile.engagedTargetId) {
      profile.engagedTargetId = target.sessionId;
      profile.nextDecisionAt = Math.max(profile.nextDecisionAt, now + profile.reactionDelayMs);
    }

    // Positioning runs every tick (smooth chase/kite); decisions throttle below.
    this.manageMovement(bot, target, profile);

    if (now < profile.nextDecisionAt) return;
    profile.nextDecisionAt = now + profile.decisionIntervalMs;
    if (profile.useAbilities) this.tryCastAbility(bot, target, profile, now);
  }

  /** Pick an enemy: the lowest-HP foe (focus fire) or the nearest one. "Enemy"
   *  is any living player on another team — bots are red, humans blue, so red
   *  bots naturally hunt the player(s) and ignore each other. */
  private acquireTarget(bot: Player, profile: BotProfile): Player | undefined {
    let best: Player | undefined;
    let bestScore = Infinity;
    this.ctx.state.players.forEach((p, id) => {
      if (id === bot.sessionId || !p.alive || p.team === bot.team) return;
      const dx = p.x - bot.x;
      const dz = p.z - bot.z;
      const score = profile.focusLowestHp ? p.hp : dx * dx + dz * dz;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    });
    return best;
  }

  /**
   * Decide chase vs. kite, and drive the legs every tick.
   *
   * We set BOTH seams when closing in: `attackTargets` (so auto-attack modes like
   * zombie survival chase + strike on the timer via `updateAutoAttack`) AND a
   * chase `destination`. The tick loop honours `attackTargets` over `destinations`
   * when auto-attack is enabled, so the destination is simply ignored there. But
   * in PvP modes (FFA/ranked) auto-attack is OFF, so without a destination the bot
   * would just stand still — it only ever moved via the flee branch, which is why
   * bots looked rooted unless badly hurt. Feeding a chase destination fixes that.
   */
  private manageMovement(bot: Player, target: Player, profile: BotProfile): void {
    const auto = AUTO_ATTACKS[bot.characterClass as CharacterClass];
    const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
    const hpFrac = bot.maxHp > 0 ? bot.hp / bot.maxHp : 1;
    const rooted = isRooted(bot);

    // Flee when crowded (ranged kiters) or badly hurt — but a root pins us, so
    // there's no point setting a flee destination; just keep striking in place.
    const tooClose = profile.kite && auto.kind === 'ranged' && dist < auto.range * 0.55;
    const wounded = profile.retreatAtHpFrac > 0 && hpFrac <= profile.retreatAtHpFrac;
    if (!rooted && (tooClose || (wounded && profile.kite))) {
      this.ctx.attackTargets.delete(bot.sessionId);
      this.setFleeDestination(bot, target, auto.range);
      return;
    }

    // Otherwise close in: mark the attack target (auto-attack modes strike on the
    // timer) and walk toward striking range so non-auto-attack modes chase too.
    this.ctx.attackTargets.set(bot.sessionId, target.sessionId);
    this.setChaseDestination(bot, target, auto.range, dist, rooted);
  }

  /** Walk toward the target, stopping at roughly striking range. Cleared when
   *  already in range (stand and fight) or rooted (can't move). Mirrors the
   *  room's auto-attack chase for modes that don't run it. */
  private setChaseDestination(
    bot: Player,
    target: Player,
    range: number,
    dist: number,
    rooted: boolean,
  ): void {
    const standoff = range * 0.85;
    if (rooted || dist <= standoff) {
      this.ctx.destinations.delete(bot.sessionId);
      return;
    }
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const len = Math.hypot(dx, dz) || 1;
    const travel = dist - standoff;
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
    this.ctx.destinations.set(bot.sessionId, {
      x: clampTo(bot.x + (dx / len) * travel, limit),
      z: clampTo(bot.z + (dz / len) * travel, limit),
    });
  }

  /** Set a destination directly away from the threat, out to roughly attack
   *  range, clamped to the arena. */
  private setFleeDestination(bot: Player, threat: Player, range: number): void {
    const dx = bot.x - threat.x;
    const dz = bot.z - threat.z;
    const len = Math.hypot(dx, dz) || 1;
    const limit = ARENA_HALF_SIZE - PLAYER_RADIUS;
    const reach = range * 0.9;
    this.ctx.destinations.set(bot.sessionId, {
      x: clampTo(bot.x + (dx / len) * reach, limit),
      z: clampTo(bot.z + (dz / len) * reach, limit),
    });
  }

  /** Pick and cast at most one appropriate ability this decision tick. Priority:
   *  emergency heal → defensive shield → offense in range → engage/buff util. */
  private tryCastAbility(bot: Player, target: Player, profile: BotProfile, now: number): void {
    const loadout = CLASS_LOADOUTS[bot.characterClass as CharacterClass];
    const abilities = Object.values(loadout).filter(Boolean) as AbilityKind[];
    const hpFrac = bot.maxHp > 0 ? bot.hp / bot.maxHp : 1;
    const dist = Math.hypot(target.x - bot.x, target.z - bot.z);

    // Bucket the ready abilities by role so we can apply priority.
    const ready = abilities.filter((a) => this.isReady(bot, a, now));
    const byRole = (role: AbilityRole) =>
      ready.find((a) => this.roleOf(bot.characterClass as CharacterClass, a) === role);

    const wounded = profile.retreatAtHpFrac > 0 && hpFrac <= Math.max(profile.retreatAtHpFrac, 0.6);

    // 1. Emergency heal (self).
    const heal = wounded ? byRole('heal') : undefined;
    if (heal) return this.castAt(bot, target, heal, profile, { self: true });

    // 2. Defensive shield when hurt or under pressure.
    const shield = hpFrac <= 0.7 ? byRole('shield') : undefined;
    if (shield) return this.castAt(bot, target, shield, profile, { self: true });

    // 3. Offense — only when the target is within the ability's reach.
    const offense = byRole('offense');
    if (offense) {
      const def = this.ctx.tuning.abilityFor(bot.characterClass, offense);
      if (dist <= def.range + PLAYER_RADIUS) {
        return this.castAt(bot, target, offense, profile, { self: false });
      }
    }

    // 4. Mobility / self-buff util (dash to engage, attack-speed buffs).
    const mobility = byRole('mobility');
    if (mobility) return this.castAt(bot, target, mobility, profile, { self: false });
  }

  private isReady(bot: Player, ability: AbilityKind, now: number): boolean {
    const cd = this.hooks.cooldowns.get(bot.sessionId);
    if (!cd) return false;
    if ((cd[ability] ?? 0) > now) return false;
    const def = this.ctx.tuning.abilityFor(bot.characterClass, ability);
    return bot.mana >= def.manaCost;
  }

  /** Build and issue a cast message aimed at `target` (or self), respecting the
   *  ability's aim mode and the profile's aim error. `handleCast` re-validates. */
  private castAt(
    bot: Player,
    target: Player,
    ability: AbilityKind,
    profile: BotProfile,
    opts: { self: boolean },
  ): void {
    const def = this.ctx.tuning.abilityFor(bot.characterClass, ability);
    // Aim toward the target, with per-difficulty angular error on skillshots.
    let dirX = target.x - bot.x;
    let dirZ = target.z - bot.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;
    if (def.aim === 'direction' || def.aim === 'point') {
      const jitter = (Math.random() * 2 - 1) * profile.aimErrorRad;
      const a = Math.atan2(dirX, dirZ) + jitter;
      dirX = Math.sin(a);
      dirZ = Math.cos(a);
    }

    const msg: CastMessage = { ability, dirX, dirZ };
    if (def.aim === 'point') {
      msg.tx = bot.x + dirX * Math.min(def.range, len);
      msg.tz = bot.z + dirZ * Math.min(def.range, len);
    } else if (def.aim === 'unit') {
      // Self-targeted heals (renew) lock onto the bot; offensive CC onto the foe.
      msg.targetId = opts.self ? bot.sessionId : target.sessionId;
    }
    this.hooks.cast(bot.sessionId, msg);
  }

  /** Classify an ability by scanning its effect tree (cached). */
  private roleOf(characterClass: CharacterClass, ability: AbilityKind): AbilityRole {
    const cached = this.roleCache.get(ability);
    if (cached) return cached;
    const def = this.ctx.tuning.abilityFor(characterClass, ability);
    const role = classifyAbility(def);
    this.roleCache.set(ability, role);
    return role;
  }
}

/** Minimal structural view of an effect node (and its nested `onHit`). */
interface EffectNode {
  type: string;
  status?: { kind?: string };
  onHit?: EffectNode[];
}

/** Derive an {@link AbilityRole} from what an ability's effects do. Offense
 *  (anything that damages or CCs an enemy) wins; otherwise heal, then shield,
 *  then mobility/self-buff. */
function classifyAbility(def: AbilityDef): AbilityRole {
  let offense = false;
  let heal = false;
  let shield = false;
  const visit = (nodes: EffectNode[] | undefined): void => {
    for (const e of nodes ?? []) {
      switch (e.type) {
        case 'damage':
        case 'knockback':
          offense = true;
          break;
        case 'heal':
          heal = true;
          break;
        case 'shield':
          shield = true;
          break;
        case 'status': {
          const kind = e.status?.kind;
          if (kind === 'hot') heal = true;
          else if (kind === 'shield') shield = true;
          else if (kind && kind !== 'haste' && kind !== 'attack_speed') offense = true;
          break;
        }
      }
      visit(e.onHit);
    }
  };
  visit(def.effects as unknown as EffectNode[]);
  if (offense) return 'offense';
  if (heal) return 'heal';
  if (shield) return 'shield';
  return 'mobility';
}

function clampTo(v: number, limit: number): number {
  return v < -limit ? -limit : v > limit ? limit : v;
}
