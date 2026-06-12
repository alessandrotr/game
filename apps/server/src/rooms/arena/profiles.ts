import type { Player } from '../schema.js';
import { getProgress, recordResult, type Progress } from '../../db/players.js';

/** A database handle (a pool or transaction), as accepted by the player queries. */
type Db = Parameters<typeof getProgress>[0];

/** A player's persisted totals at join time. Live totals are tracked on the
 *  replicated `Player`; the delta (live − base) is flushed to the DB on leave. */
export interface MatchProfile {
  playerId: number;
  characterClass: string;
  baseXp: number;
  baseKills: number;
  baseDeaths: number;
}

/** Load this account's class progression and snapshot its base totals. Returns
 *  both the profile (for the room's accumulator) and the progress (to seed the
 *  replicated career fields). */
export async function fetchProfile(
  db: Db,
  playerId: number,
  characterClass: string,
): Promise<{ profile: MatchProfile; progress: Progress }> {
  const progress = await getProgress(db, playerId, characterClass);
  return {
    profile: {
      playerId,
      characterClass,
      baseXp: progress.xp,
      baseKills: progress.kills,
      baseDeaths: progress.deaths,
    },
    progress,
  };
}

/** Persist this session's progression delta (live totals − loaded base) plus the
 *  match outcome. No-op when nothing changed. */
export function persistProfileDelta(
  db: Db,
  profile: MatchProfile,
  player: Player,
  outcome: 'win' | 'loss' | undefined,
): void {
  const delta = {
    xp: player.xp - profile.baseXp,
    kills: player.kills - profile.baseKills,
    deaths: player.deaths - profile.baseDeaths,
    wins: outcome === 'win' ? 1 : 0,
    losses: outcome === 'loss' ? 1 : 0,
  };
  if (delta.xp <= 0 && delta.kills <= 0 && delta.deaths <= 0 && !delta.wins && !delta.losses) {
    return;
  }
  void recordResult(db, profile.playerId, profile.characterClass, delta).catch((err) =>
    console.error('[arena] failed to save profile:', err),
  );
}
