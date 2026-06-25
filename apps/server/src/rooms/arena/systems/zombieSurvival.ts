import {
  ARENA_PORTAL_POINT,
  PLAYER_RADIUS,
  ZOMBIE_FAT_ATTACK_BONUS_MS,
  ZOMBIE_FAT_SKIN_ID,
  ZOMBIE_FAT_SPEED_PENALTY,
  ZOMBIE_MINIBOSS_SKIN_ID,
  ZOMBIE_SKIN_ID,
  ZOMBIE_SPAWN_PORTALS,
  ZOMBIE_SPEED_JITTER,
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_SPRINTER_SPAWN_CHANCE,
  ZOMBIE_SPRINTER_SPEED_MAX,
  ZOMBIE_SPRINTER_SPEED_MIN,
  ZOMBIE_WANDER_REROLL_MAX_MS,
  ZOMBIE_WANDER_REROLL_MIN_MS,
  pickWeightedPortal,
  zombieFatChanceForLevel,
  zombieFatHealthForLevel,
  zombieHealthForLevel,
  zombieMaxAlive,
  zombieSprinterHealthForLevel,
  type AbilityKind,
  type RoomLayout,
} from '@arena/shared';
import { Player, type ArenaState } from '../../schema.js';
import { clamp } from '../../util/locomotion.js';
import { makeZombieProfile, type BotProfile } from './bots.js';

/** Per-zombie movement personality: a spawn-rolled speed offset (±jitter) and a
 *  lateral chase-wander bias that re-rolls on its own clock, plus stuck-detection
 *  bookkeeping — so a horde spreads + flanks instead of trailing in a line. */
export interface ZombieAiState {
  speedOffset: number;
  wander: number;
  wanderUntil: number;
  attackBonusMs: number;
  /** Last chase position + consecutive near-stationary ticks while out of range. */
  lastX: number;
  lastZ: number;
  stuckTicks: number;
  /** While `simTime < detourUntil`, steer a forced ~perpendicular heading
   *  (sign = `detourSide`) to escape the obstacle instead of re-ramming it. */
  detourUntil: number;
  detourSide: number;
}

/** The bits of room state the zombie logic reads/writes — handed in by the room
 *  (by reference / as closures) so this module needs none of the room's
 *  internals directly. Maps are shared by reference (mutations are seen by both). */
export interface ZombieSurvivalDeps {
  now: () => number;
  state: ArenaState;
  bots: Map<string, BotProfile>;
  verticalVelocity: Map<string, number>;
  grounded: Map<string, boolean>;
  cooldowns: Map<string, Partial<Record<AbilityKind, number>>>;
  /** Arena half-extent (used to clamp spawns inside the walls). */
  arenaLimit: number;
  /** Allocate the next unique bot sequence number (the room owns the counter). */
  nextBotId: () => number;
  /** Reset a freshly-built bot to spawn defaults (shared room logic). */
  resetPlayer: (player: Player) => void;
  /** The match's room-expansion layout, or null before/without it. */
  roomLayout: () => RoomLayout | null;
}

/**
 * Mode-specific logic for ZOMBIE SURVIVAL — behaviour that only exists in a horde
 * mode, kept out of the shared ArenaRoom sim. The room builds one only in zombie
 * mode and delegates to it.
 *
 * (Mini-boss AI, horde collision resolution and door unlocks move here next.)
 */
export class ZombieSurvival {
  /** Per-zombie AI personality, keyed by session id. */
  private readonly ai = new Map<string, ZombieAiState>();

  constructor(private readonly deps: ZombieSurvivalDeps) {}

  // --- Per-zombie AI personality -------------------------------------------

  /** Get (or lazily roll, once) a zombie's AI personality. */
  aiFor(id: string): ZombieAiState {
    let ai = this.ai.get(id);
    if (!ai) {
      ai = {
        speedOffset: (Math.random() * 2 - 1) * ZOMBIE_SPEED_JITTER,
        // Commit to a flank side (±) at spawn with a 0.55–1.0 arc magnitude — half
        // the horde curls left, half right, so they encircle instead of trailing.
        wander: (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.45),
        wanderUntil: this.deps.now() + this.rollWanderInterval(),
        attackBonusMs: 0,
        lastX: 0,
        lastZ: 0,
        stuckTicks: 0,
        detourUntil: 0,
        detourSide: 1,
      };
      this.ai.set(id, ai);
    }
    return ai;
  }

  /** Drop a (removed) zombie's personality so a recycled id re-rolls fresh. */
  forget(id: string): void {
    this.ai.delete(id);
  }

  /** A randomized gap until a zombie next re-picks its wander path. */
  rollWanderInterval(): number {
    return (
      ZOMBIE_WANDER_REROLL_MIN_MS +
      Math.random() * (ZOMBIE_WANDER_REROLL_MAX_MS - ZOMBIE_WANDER_REROLL_MIN_MS)
    );
  }

  /** Choose a spawn portal for a new zombie: a random fixed gate before the room
   *  expands, else a distance-weighted pick across the unlocked sections' portals
   *  (so hordes pour from gates near the players). */
  pickPortal(): { x: number; z: number } {
    const layout = this.deps.roomLayout();
    if (!layout || this.deps.state.unlockedSections === 0) {
      return (
        ZOMBIE_SPAWN_PORTALS[Math.floor(Math.random() * ZOMBIE_SPAWN_PORTALS.length)] ??
        ARENA_PORTAL_POINT
      );
    }
    const humans: { x: number; z: number }[] = [];
    this.deps.state.players.forEach((p, id) => {
      if (p.alive && !this.deps.bots.has(id)) humans.push({ x: p.x, z: p.z });
    });
    return pickWeightedPortal(ZOMBIE_SPAWN_PORTALS, layout, this.deps.state.unlockedSections, humans);
  }

  // --- Counts (read by the wave director) ----------------------------------

  /** Human (non-bot) players present. */
  countHumans(): number {
    let n = 0;
    this.deps.state.players.forEach((_player, id) => {
      if (!this.deps.bots.has(id)) n += 1;
    });
    return n;
  }

  /** Zombies currently alive (corpses awaiting removal are excluded). */
  countAliveZombies(): number {
    let n = 0;
    this.deps.bots.forEach((_profile, id) => {
      if (this.deps.state.players.get(id)?.alive) n += 1;
    });
    return n;
  }

  // --- Spawning ------------------------------------------------------------

  /** Spawn one zombie for `level`: a red-team melee bot that pours out of a
   *  portal with level-scaled health and a relentless-chaser AI profile. The
   *  shared sim (auto-attack chase) + BotDirector drive the rest. */
  spawnZombie(level: number): void {
    // Hard backstop above the director's own (level-scaled) cap — corpses can
    // briefly inflate the map — so a bug can never let zombies grow without bound.
    if (this.deps.bots.size >= zombieMaxAlive(level) + 24) return;
    // Roll this horde slot's variant: a Sprinter (fast, fragile), a Fat (slow,
    // tanky, quicker swings), or a normal zombie. One roll partitions the chances
    // so each variant keeps its exact marginal probability.
    const roll = Math.random();
    const fatChance = zombieFatChanceForLevel(level);
    const variant: 'sprinter' | 'fat' | 'normal' =
      roll < ZOMBIE_SPRINTER_SPAWN_CHANCE
        ? 'sprinter'
        : roll < ZOMBIE_SPRINTER_SPAWN_CHANCE + fatChance
          ? 'fat'
          : 'normal';

    const id = `zombie-${this.deps.nextBotId()}`;
    const player = new Player();
    player.sessionId = id;
    player.name = variant === 'sprinter' ? 'Sprinter' : variant === 'fat' ? 'Fat' : 'Zombie';
    player.characterClass = 'warrior'; // melee auto-attack (drives stats/attacks)
    player.skinId =
      variant === 'sprinter'
        ? ZOMBIE_SPRINTER_SKIN_ID
        : variant === 'fat'
          ? ZOMBIE_FAT_SKIN_ID
          : ZOMBIE_SKIN_ID;
    player.team = 'red';
    this.deps.resetPlayer(player);
    // Override the team spawn with a portal mouth (+ jitter so a pulse fans out
    // instead of stacking), then apply the variant's level-scaled health.
    const limit = this.deps.arenaLimit - PLAYER_RADIUS;
    const jitter = () => (Math.random() * 2 - 1) * 1.6;
    const portal = this.pickPortal();
    player.x = clamp(portal.x + jitter(), -limit, limit);
    player.z = clamp(portal.z + jitter(), -limit, limit);
    player.maxHp =
      variant === 'sprinter'
        ? zombieSprinterHealthForLevel(level)
        : variant === 'fat'
          ? zombieFatHealthForLevel(level)
          : zombieHealthForLevel(level);
    player.hp = player.maxHp;

    this.deps.state.players.set(id, player);
    this.deps.verticalVelocity.set(id, 0);
    this.deps.grounded.set(id, true);
    this.deps.cooldowns.set(id, {});
    this.deps.bots.set(id, makeZombieProfile());
    const ai = this.aiFor(id); // roll this zombie's speed/wander personality
    if (variant === 'sprinter') {
      // A Sprinter's speed offset IS its bonus over a same-level zombie (2–3 u/s).
      ai.speedOffset =
        ZOMBIE_SPRINTER_SPEED_MIN +
        Math.random() * (ZOMBIE_SPRINTER_SPEED_MAX - ZOMBIE_SPRINTER_SPEED_MIN);
    } else if (variant === 'fat') {
      // A Fat is slower than a same-level zombie and swings a touch sooner.
      ai.speedOffset = -ZOMBIE_FAT_SPEED_PENALTY;
      ai.attackBonusMs = ZOMBIE_FAT_ATTACK_BONUS_MS;
    }
  }

  /** Spawn the wave's Mini-Boss: a slow, very tanky red bot with special actions
   *  (driven by the room's mini-boss AI). */
  spawnMiniBoss(): void {
    const id = `zombie-miniboss-${this.deps.nextBotId()}`;
    const player = new Player();
    player.sessionId = id;
    player.name = 'Mini Boss';
    player.characterClass = 'warrior';
    player.skinId = ZOMBIE_MINIBOSS_SKIN_ID;
    player.team = 'red';
    this.deps.resetPlayer(player);

    const limit = this.deps.arenaLimit - 0.8;
    const portal = this.pickPortal();
    player.x = clamp(portal.x + (Math.random() * 2 - 1) * 1.6, -limit, limit);
    player.z = clamp(portal.z + (Math.random() * 2 - 1) * 1.6, -limit, limit);

    player.maxHp = 750;
    player.hp = 750;

    this.deps.state.players.set(id, player);
    this.deps.verticalVelocity.set(id, 0);
    this.deps.grounded.set(id, true);
    this.deps.cooldowns.set(id, {});
    this.deps.bots.set(id, makeZombieProfile());

    const ai = this.aiFor(id);
    ai.speedOffset = -1.5; // slow movement
  }
}
