import {
  ZOMBIE_FIRST_DELAY_MS,
  ZOMBIE_LEVEL_BREAK_MS,
  ZOMBIE_MAX_ALIVE,
  ZOMBIE_SPAWN_BATCH,
  ZOMBIE_SPAWN_INTERVAL_MS,
  zombieHordeSize,
} from '@arena/shared';
import type { ArenaContext } from './context.js';

/** What the room exposes so the wave director can populate hordes. */
export interface ZombieHooks {
  /** Create one zombie for `level` at the arena portal (the room owns the
   *  Player + bot bookkeeping). */
  spawnZombie(level: number): void;
  /** How many zombies are currently alive (corpses awaiting removal excluded). */
  aliveZombies(): number;
  /** Whether any human player is present (waves pause in an empty room). */
  humansPresent(): boolean;
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

  constructor(
    private readonly ctx: ArenaContext,
    private readonly hooks: ZombieHooks,
  ) {}

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
      if (now >= this.phaseUntil) this.beginLevel(now);
    } else {
      // Stream the horde out in pulses, throttled by time and the alive cap.
      if (this.quota > 0 && now >= this.nextSpawnAt && alive < ZOMBIE_MAX_ALIVE) {
        const room = ZOMBIE_MAX_ALIVE - alive;
        const batch = Math.min(ZOMBIE_SPAWN_BATCH, this.quota, room);
        for (let i = 0; i < batch; i++) this.hooks.spawnZombie(this.level);
        this.quota -= batch;
        this.nextSpawnAt = now + ZOMBIE_SPAWN_INTERVAL_MS;
      }
      // Level cleared: the whole quota has spawned and every zombie is dead.
      if (this.quota === 0 && alive === 0) {
        this.phase = 'intermission';
        this.phaseUntil = now + ZOMBIE_LEVEL_BREAK_MS;
      }
    }

    this.publish(this.hooks.aliveZombies());
  }

  /** Begin the next level's horde. */
  private beginLevel(now: number): void {
    this.level += 1;
    this.quota = zombieHordeSize(this.level);
    this.phase = 'active';
    this.nextSpawnAt = now; // first pulse immediately
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
