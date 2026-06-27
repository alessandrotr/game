import type { Player } from '../../schema.js';
import { getProgress, recordResult, recordZombieRun, type Progress } from '../../../db/players.js';
import { captureServerError } from '../../../observability.js';
import type { ZombieRunStats } from './zombieStats.js';

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
  /** Sim time (ms) the player joined — used to time arena matches for history. */
  joinedAt: number;
}

/** Load this account's class progression and snapshot its base totals. Returns
 *  both the profile (for the room's accumulator) and the progress (to seed the
 *  replicated career fields). */
export async function fetchProfile(
  db: Db,
  playerId: number,
  characterClass: string,
  nowMs: number,
): Promise<{ profile: MatchProfile; progress: Progress }> {
  const progress = await getProgress(db, playerId, characterClass);
  return {
    profile: {
      playerId,
      characterClass,
      baseXp: progress.xp,
      baseKills: progress.kills,
      baseDeaths: progress.deaths,
      joinedAt: nowMs,
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
    // Silent failure here means a player loses earned progression — surface it.
    captureServerError(err, {
      message: '[arena] failed to save profile:',
      tags: { where: 'arena.persistProfile', characterClass: profile.characterClass },
      extra: { playerId: profile.playerId, delta },
    }),
  );
}

/** Fold a finished zombie-survival run into the account's per-class lifetime
 *  stats. `finalWave` is the team's current wave (used when the player outlived
 *  the run / never fell); `nowMs` is the current sim time for the survival clock. */
export function persistZombieRun(
  db: Db,
  profile: MatchProfile,
  stats: ZombieRunStats,
  finalWave: number,
  nowMs: number,
): void {
  const endedAt = stats.diedAt ?? nowMs;
  const delta = {
    runs: 1,
    bestWave: stats.waveAtDeath ?? finalWave,
    timeSurvived: Math.max(0, Math.round((endedAt - stats.startedAt) / 1000)),
    killsNormal: stats.killsNormal,
    killsSprinter: stats.killsSprinter,
    killsFat: stats.killsFat,
    killsMiniboss: stats.killsMiniboss,
    killsTitan: stats.killsTitan,
    perksPicked: stats.perksPicked,
    altars: stats.altars,
    doors: stats.doors,
    traps: stats.traps,
    damageDealt: Math.round(stats.damageDealt),
    damageTaken: Math.round(stats.damageTaken),
  };
  void recordZombieRun(db, profile.playerId, profile.characterClass, delta).catch((err) =>
    captureServerError(err, {
      message: '[arena] failed to save zombie run:',
      tags: { where: 'arena.persistZombieRun', characterClass: profile.characterClass },
      extra: { playerId: profile.playerId, delta },
    }),
  );
}
