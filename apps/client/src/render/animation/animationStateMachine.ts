import type { AnimationName } from '@arena/shared';

/**
 * A character animation state machine — the Phase 4.2 deliverable.
 *
 * Pure (no React/Three dependencies) so it is trivially unit-testable and can be
 * driven by any input source. Today the client derives its inputs locally
 * (speed from movement, one-shot events from server cast/damage messages, alive
 * from replicated state); a future networked `animState` field could feed the
 * same `step()` with no change to gameplay or rendering code.
 *
 * States map onto the shared logical `AnimationName`s:
 *   Idle / Walk / Run — locomotion (Run = sprinting, Walk = normal movement)
 *   Attack / Cast / Hit — non-looping one-shots, triggered by events
 *   Death — latched while `!alive`, overrides everything
 */

/** One-shot animation events the machine reacts to (death is driven by `alive`). */
export type AnimationEventKind = 'attack' | 'cast' | 'hit';

export interface AnimationInputs {
  /** Horizontal speed in world units/second. */
  speed: number;
  /** Whether the player is sprinting (Run) vs walking (Walk) while moving. */
  sprinting: boolean;
  /** Whether the character is alive. Death latches until this returns true. */
  alive: boolean;
  /** A one-shot event to play this step, or null. */
  event: AnimationEventKind | null;
}

/** Speed (world units/sec) at or above which the character counts as moving. */
const MOVE_SPEED_THRESHOLD = 0.6;

/**
 * Fallback one-shot durations (ms). The GLTF backend prefers the real clip
 * length when known; these keep the FSM self-contained and drive procedural
 * placeholders, which have no clip length.
 */
const ONESHOT_MS: Record<AnimationEventKind, number> = {
  attack: 500,
  cast: 600,
  hit: 350,
};

export interface CharacterFSM {
  /** Advance by `dtMs` and return the logical animation to play this frame. */
  step(inputs: AnimationInputs, dtMs: number): AnimationName;
  /** The animation chosen on the most recent `step` (or 'idle' before any). */
  readonly current: AnimationName;
}

/** Create an independent state machine instance (one per character). */
export function createCharacterFSM(): CharacterFSM {
  let oneShot: { name: AnimationEventKind; remaining: number } | null = null;
  let current: AnimationName = 'idle';

  const locomotion = (speed: number, sprinting: boolean): AnimationName =>
    speed < MOVE_SPEED_THRESHOLD ? 'idle' : sprinting ? 'run' : 'walk';

  return {
    get current() {
      return current;
    },
    step(inputs, dtMs) {
      // Death overrides everything; it latches because `alive` stays false until
      // the server respawns the player, at which point locomotion resumes.
      if (!inputs.alive) {
        oneShot = null;
        current = 'die';
        return current;
      }

      // A fresh event starts (or restarts) a one-shot, interrupting any other.
      if (inputs.event) {
        oneShot = { name: inputs.event, remaining: ONESHOT_MS[inputs.event] };
        current = inputs.event;
        return current;
      }

      // Continue an in-progress one-shot until its time runs out.
      if (oneShot) {
        oneShot.remaining -= dtMs;
        if (oneShot.remaining > 0) {
          current = oneShot.name;
          return current;
        }
        oneShot = null;
      }

      current = locomotion(inputs.speed, inputs.sprinting);
      return current;
    },
  };
}
