import { EMOTE_MS, type AnimationName } from '@arena/shared';

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
 *   Idle / Run — locomotion (single move speed: Run while moving, else Idle)
 *   Attack / Cast / Hit — non-looping one-shots, triggered by events
 *   Death — latched while `!alive`, overrides everything
 */

/** One-shot animation events the machine reacts to (death is driven by `alive`).
 *  Emotes (dances) are long, looping one-shots cancelled by movement. */
export type AnimationEventKind = 'attack' | 'cast' | 'hit' | 'dance1' | 'dance2';

export interface AnimationInputs {
  /** Horizontal speed in world units/second. */
  speed: number;
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
  dance1: EMOTE_MS,
  dance2: EMOTE_MS,
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

  // Single move speed (LoL-style): run while moving, idle when stopped. The
  // `walk` clip stays in the type for future slow/rooted states.
  const locomotion = (speed: number): AnimationName =>
    speed < MOVE_SPEED_THRESHOLD ? 'idle' : 'run';

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

      const moving = inputs.speed >= MOVE_SPEED_THRESHOLD;

      // A fresh event arms a one-shot (its timer starts now), interrupting any
      // other.
      if (inputs.event) oneShot = { name: inputs.event, remaining: ONESHOT_MS[inputs.event] };

      // Movement takes priority over any transient pose: casting, attacking or
      // getting hit while running keeps the Run animation instead of freezing
      // into a pose that slides across the ground. (Emotes were already
      // movement-cancelled; now combat poses are too.) Rooted casts stop the
      // player first, so `moving` is false and their pose plays normally.
      if (oneShot) {
        if (moving) {
          oneShot = null;
        } else {
          oneShot.remaining -= dtMs;
          if (oneShot.remaining > 0) {
            current = oneShot.name;
            return current;
          }
          oneShot = null;
        }
      }

      current = locomotion(inputs.speed);
      return current;
    },
  };
}
