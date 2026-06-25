import {
  ZOMBIE_FIRST_DELAY_MS,
  ZOMBIE_LEVEL_BREAK_MS,
  ZOMBIE_SPAWN_BATCH,
  ZOMBIE_SPAWN_INTERVAL_MAX_MS,
  ZOMBIE_SPAWN_INTERVAL_MIN_MS,
  zombieHordeSize,
  zombieMaxAlive,
} from '@arena/shared';
import type { ArenaContext } from '../context.js';

/** What the room exposes so the wave director can populate hordes. */
export interface ZombieHooks {
  /** Create one zombie for `level` at the arena portal (the room owns the
   *  Player + bot bookkeeping). */
  spawnZombie(level: number): void;
  /** Spawn one Mini-Boss for the boss wave. */
  spawnMiniBoss?(level: number): void;
  /** How many zombies are currently alive (corpses awaiting removal excluded). */
  aliveZombies(): number;
  /** Whether any human player is present (waves pause in an empty room). */
  humansPresent(): boolean;
  /** Called when a wave is fully cleared. Returns `true` if the intermission
   *  should pause (e.g. perk offers are pending and must be resolved first). */
  onWaveClear?(level: number): boolean;
  /** Called when the intermission is paused for perks — returns `true` when
   *  all pending perk picks have been resolved (the wave may resume). */
  perksResolved?(): boolean;
  /** Called when a new wave begins (wave charges reset). */
  onWaveBegin?(level: number): void;
}

/** The wave director's lifecycle phase. */
type Phase = 'intermission' | 'active';

/**
 * Drives endless zombie survival: one escalating horde per level, each
 * exponentially larger than the last (see {@link zombieHordeSize}). A level's
 * whole quota streams out of the portal in small pulses, capped at
 * {@link ZOMBIE_MAX_ALIVE} alive at once so the entity count stays bounded no
 * matter how high the level climbs. When the quota is exhausted *and* every
 * zombie is dead, a short breather precedes the next, bigger horde — forever.
 *
 * It is purely an orchestrator: it decides *when* and *how many* to spawn and
 * tracks the level, but the room owns the actual zombie entities (creation,
 * death, removal) and the {@link BotDirector} drives their chase/attack. The
 * director writes the replicated wave counters every tick for the HUD.
 */
export class ZombieDirector {
  private level = 0;
  /** Zombies still to spawn this level. */
  private quota = 0;
  private phase: Phase = 'intermission';
  /** Sim time (ms) the current intermission ends and the next horde begins. */
  private phaseUntil = 0;
  /** Sim time (ms) the next spawn pulse is allowed. */
  private nextSpawnAt = 0;
  /** True while the intermission is paused waiting for perk picks. */
  private perkPaused = false;

  constructor(
    private readonly ctx: ArenaContext,
    private readonly hooks: ZombieHooks,
  ) {}

  /** The current wave/level (every alive zombie belongs to it, since a level
   *  only advances once all of its zombies are dead). */
  currentLevel(): number {
    return this.level;
  }

  /** Arm the first horde's countdown (called once the room is built). */
  start(now: number): void {
    this.phase = 'intermission';
    this.phaseUntil = now + ZOMBIE_FIRST_DELAY_MS;
    this.publish(0);
  }

  /** Advance the wave state one tick. Pauses entirely while no human is present
   *  (so an emptied room doesn't pour zombies into the void). */
  update(now: number): void {
    const alive = this.hooks.aliveZombies();
    if (!this.hooks.humansPresent()) {
      this.publish(alive);
      return;
    }

    if (this.phase === 'intermission') {
      // If paused for perk picks, check if they're resolved.
      if (this.perkPaused) {
        if (this.hooks.perksResolved?.()) {
          this.perkPaused = false;
          // Restart the break timer from now.
          this.phaseUntil = now + ZOMBIE_LEVEL_BREAK_MS;
        } else {
          // Still waiting — push the timer forward so it doesn't expire.
          this.phaseUntil = Math.max(this.phaseUntil, now + 100);
          this.publish(alive);
          return;
        }
      }
      if (now >= this.phaseUntil) this.beginLevel(now);
    } else {
      // Stream the horde out in pulses, throttled by time and the (level-scaled)
      // alive cap.
      const cap = zombieMaxAlive(this.level);
      if (this.quota > 0 && now >= this.nextSpawnAt && alive < cap) {
        const room = cap - alive;
        const batch = Math.min(ZOMBIE_SPAWN_BATCH, this.quota, room);
        for (let i = 0; i < batch; i++) this.hooks.spawnZombie(this.level);
        this.quota -= batch;
        this.nextSpawnAt = now + this.randomSpawnDelay();
      }
      // Level cleared: the whole quota has spawned and every zombie is dead.
      if (this.quota === 0 && alive === 0) {
        this.phase = 'intermission';
        this.phaseUntil = now + ZOMBIE_LEVEL_BREAK_MS;
        // Fire the wave-clear hook (perk offers, etc). If it returns true,
        // pause the intermission timer until perks are resolved.
        if (this.hooks.onWaveClear?.(this.level)) {
          this.perkPaused = true;
        }
      }
    }

    this.publish(this.hooks.aliveZombies());
  }

  /** A randomized gap until the next spawn pulse, so the horde arrives unevenly. */
  private randomSpawnDelay(): number {
    const span = ZOMBIE_SPAWN_INTERVAL_MAX_MS - ZOMBIE_SPAWN_INTERVAL_MIN_MS;
    return ZOMBIE_SPAWN_INTERVAL_MIN_MS + Math.random() * span;
  }

  /** Begin the next level's horde. */
  private beginLevel(now: number): void {
    this.level += 1;
    this.quota = zombieHordeSize(this.level);
    if (this.level > 0 && this.level % 6 === 0) {
      this.quota = Math.max(1, Math.floor(this.quota * 0.35));
      const bossCount = Math.floor(this.level / 6);
      for (let i = 0; i < bossCount; i++) {
        this.hooks.spawnMiniBoss?.(this.level);
      }
    }
    this.phase = 'active';
    this.nextSpawnAt = now; // first pulse immediately
    this.hooks.onWaveBegin?.(this.level);
  }

  /** Mirror the live wave counters into replicated state for the HUD. */
  private publish(alive: number): void {
    const state = this.ctx.state;
    const remaining = this.quota + alive;
    if (state.zombieLevel !== this.level) state.zombieLevel = this.level;
    if (state.zombiesAlive !== alive) state.zombiesAlive = alive;
    if (state.zombiesRemaining !== remaining) state.zombiesRemaining = remaining;
  }
}
