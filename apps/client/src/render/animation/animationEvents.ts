import type { AnimationEventKind } from './animationStateMachine';

/**
 * A non-reactive, per-session channel for one-shot animation events
 * (attack / cast / hit). Network message handlers push events here keyed by the
 * player's session id; each character's animation loop drains its own event
 * once per frame. Mirrors the imperative, render-free style of the input/local
 * player singletons so it never triggers React re-renders.
 *
 * Last write wins: a newer event supersedes an unconsumed one in the same frame
 * (e.g. a follow-up hit replaces a stale one), which is the desired behavior for
 * a single visible reaction.
 */
const pending = new Map<string, AnimationEventKind>();

export function pushAnimationEvent(sessionId: string, kind: AnimationEventKind): void {
  pending.set(sessionId, kind);
}

/** Take and clear the pending event for a session, or null if none. */
export function consumeAnimationEvent(sessionId: string): AnimationEventKind | null {
  const event = pending.get(sessionId);
  if (event === undefined) return null;
  pending.delete(sessionId);
  return event;
}

/** Drop any pending event for a session (e.g. on leave). */
export function clearAnimationEvents(sessionId: string): void {
  pending.delete(sessionId);
}
