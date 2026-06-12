/**
 * Authoritative animation state (Phase 9.2).
 *
 * Pure rule the room runs each tick to decide every player's replicated
 * `animState`. Keeping it here (Colyseus-free) makes the policy a single,
 * unit-tested source of truth; the room owns the transient one-shot timers and
 * the "is moving" signal, this function just resolves them into a state.
 *
 * Remote clients render this state directly; the local client predicts its own
 * for zero-latency feel (same split as movement: predict locally, trust the
 * server for everyone else).
 */

/** The replicated animation states (a subset of the client's logical names). */
export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack'
  | 'cast'
  | 'hit'
  | 'die'
  | 'dance1'
  | 'dance2';

/** A transient animation the server is currently asserting (combat pose or emote). */
export interface AnimOneShot {
  name: 'attack' | 'cast' | 'hit' | 'dance1' | 'dance2';
  /** Sim time (ms) the one-shot ends at. */
  until: number;
}

export interface AnimInputs {
  alive: boolean;
  /** Whether the player moved meaningfully this tick. */
  moving: boolean;
  /** Active one-shot, or null. */
  oneShot: AnimOneShot | null;
  /** Current sim time, ms. */
  now: number;
}

/** Default visible duration (ms) for an instant ability's cast/attack pose. */
export const INSTANT_ONESHOT_MS = 350;
/** Duration (ms) of the flinch shown when a player takes (non-lethal) damage. */
export const HIT_ONESHOT_MS = 300;

/**
 * Resolve the animation state. Death wins outright. Locomotion then takes
 * priority over transient combat poses *while moving*: an instant cast or a
 * flinch taken mid-run keeps the Run animation rather than freezing into a pose
 * that visually "slides" across the ground. Rooted casts (castTimeMs > 0) stop
 * the player, so `moving` is false and their pose shows. Otherwise an unexpired
 * one-shot (cast/attack/hit/emote) plays; else Idle.
 */
export function computeAnimState(inputs: AnimInputs): AnimState {
  if (!inputs.alive) return 'die';
  if (inputs.moving) return 'run';
  if (inputs.oneShot && inputs.now < inputs.oneShot.until) return inputs.oneShot.name;
  return 'idle';
}
