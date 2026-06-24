/**
 * Per-session cast trigger for the weapon flourish: the WORLD yaw of the
 * ability's shot direction (atan2(dirX, dirZ)) plus a sequence number bumped on
 * every cast. The weapon animator watches the sequence to START a swing — so the
 * flourish is driven by the cast itself, NOT the character's animation state.
 *
 * That decoupling matters: the FSM interrupts the `cast` pose with movement (you
 * can run while casting), so a weapon keyed on the cast state would freeze while
 * walking. Driven from this event, the scepter swings down the ability line
 * whether the caster is standing or moving.
 *
 * Non-reactive singleton (mirrors `animationEvents`): cast handlers write it, the
 * render loop reads it, no React re-renders.
 */
export interface CastAim {
  /** World yaw of the shot direction. */
  yaw: number;
  /** Bumped on each cast; the animator re-arms when it changes. */
  seq: number;
  /** How long to hold the scepter extended before retracting, in ms. 0 for an
   *  instant cast (a quick thrust); a channel's duration for a sustained one
   *  (e.g. the priest's beam holds the pose for the whole channel). */
  holdMs: number;
  /** The ability id cast — lets a weapon animator pick a gesture (e.g. a melee
   *  sweep for the warrior's cleave). */
  ability: string;
}

const aims = new Map<string, CastAim>();

/** Record a cast (world aim yaw, hold duration, ability) and bump the sequence. */
export function setCastAim(sessionId: string, yaw: number, holdMs = 0, ability = ''): void {
  const seq = (aims.get(sessionId)?.seq ?? 0) + 1;
  aims.set(sessionId, { yaw, seq, holdMs, ability });
}

/** The latest cast aim for a session, or null if they've never cast. */
export function getCastAim(sessionId: string): CastAim | null {
  return aims.get(sessionId) ?? null;
}

/** Drop a session's aim (e.g. on leave). */
export function clearCastAim(sessionId: string): void {
  aims.delete(sessionId);
}
