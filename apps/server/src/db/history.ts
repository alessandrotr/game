import type { RunHistoryEntry, RunMode } from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Per-run history repository: append a finished run and read a class's recent
 * runs. Pure over a `Queryable` (real Postgres in prod, pg-mem in tests). Each
 * write prunes the player+class+mode log back to {@link MAX_PER_CLASS_MODE} so
 * the table never grows unbounded.
 */

/** Recent runs kept per (player, class, mode). Older rows are pruned on insert. */
export const MAX_PER_CLASS_MODE = 50;

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** A run to append (the id + timestamp are assigned by the DB). */
export interface RunHistoryInput {
  playerId: number;
  characterClass: string;
  mode: RunMode;
  outcome: 'win' | 'loss' | null;
  durationSec: number;
  kills: number;
  deaths: number;
  wave: number;
  xp: number;
}

/** Append one finished run, then prune the oldest beyond the per-mode cap. */
export async function recordRunHistory(q: Queryable, run: RunHistoryInput): Promise<void> {
  await q.query(
    `INSERT INTO run_history
       (player_id, character_class, mode, outcome, duration_sec, kills, deaths, wave, xp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      run.playerId,
      run.characterClass,
      run.mode,
      run.outcome,
      run.durationSec,
      run.kills,
      run.deaths,
      run.wave,
      run.xp,
    ],
  );
  // Keep only the most recent N for this player+class+mode.
  await q.query(
    `DELETE FROM run_history
      WHERE id IN (
        SELECT id FROM run_history
         WHERE player_id = $1 AND character_class = $2 AND mode = $3
         ORDER BY created_at DESC, id DESC
         OFFSET $4
      )`,
    [run.playerId, run.characterClass, run.mode, MAX_PER_CLASS_MODE],
  );
}

/** A class's recent runs (both modes), newest first. */
export async function getRunHistory(
  q: Queryable,
  playerId: number,
  characterClass: string,
  limit = MAX_PER_CLASS_MODE * 2,
): Promise<RunHistoryEntry[]> {
  const res = await q.query(
    `SELECT id, mode, character_class, outcome, duration_sec, kills, deaths, wave, xp, created_at
       FROM run_history
      WHERE player_id = $1 AND character_class = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [playerId, characterClass, limit],
  );
  return res.rows.map((row) => {
    const outcome = row.outcome === 'win' || row.outcome === 'loss' ? row.outcome : null;
    return {
      id: num(row.id),
      mode: String(row.mode) as RunMode,
      characterClass: String(row.character_class) as RunHistoryEntry['characterClass'],
      endedAt: new Date(row.created_at as string).getTime(),
      durationSec: num(row.duration_sec),
      outcome,
      kills: num(row.kills),
      deaths: num(row.deaths),
      wave: num(row.wave),
      xp: num(row.xp),
    };
  });
}
