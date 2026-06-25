import {
  ARENA_PORTAL_POINT,
  ZOMBIE_SPAWN_PORTALS,
  ZOMBIE_SPEED_JITTER,
  ZOMBIE_WANDER_REROLL_MAX_MS,
  ZOMBIE_WANDER_REROLL_MIN_MS,
  pickWeightedPortal,
  type RoomLayout,
} from '@arena/shared';
import type { ArenaState } from '../../schema.js';

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

/** The bits of room state the zombie logic reads — handed in by the room (by
 *  reference / as closures) so this module needs none of the room's internals. */
export interface ZombieSurvivalDeps {
  /** Current sim time (ms). */
  now: () => number;
  /** Replicated arena state (players + unlockedSections). */
  state: ArenaState;
  /** Live set of bot session ids (only `.has` is used). */
  bots: ReadonlyMap<string, unknown>;
  /** The match's room-expansion layout, or null before/without it. */
  roomLayout: () => RoomLayout | null;
}

/**
 * Mode-specific logic for ZOMBIE SURVIVAL — the behaviour that only exists when
 * the mode is a horde mode, kept out of the shared ArenaRoom sim. The room builds
 * one of these only in zombie mode and delegates to it.
 *
 * (Slice 1: per-zombie AI personality + spawn-portal selection. Spawning, mini-
 * boss AI, horde collision resolution and door unlocks move here next.)
 */
export class ZombieSurvival {
  /** Per-zombie AI personality, keyed by session id. */
  private readonly ai = new Map<string, ZombieAiState>();

  constructor(private readonly deps: ZombieSurvivalDeps) {}

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
}
