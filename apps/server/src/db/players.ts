import { levelForXp } from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Player + per-class progression repository (Phase 13.2). Pure over a
 * `Queryable` so it runs against real Postgres in prod and an in-memory one in
 * tests. "Login" is a passwordless find-or-create by username.
 */

export interface PlayerRow {
  id: number;
  username: string;
}

export interface Progress {
  xp: number;
  level: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
}

/** Stat deltas applied at the end of a match / on a kill. */
export interface ResultDelta {
  xp: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** Find-or-create a player by username; touches `last_seen`. */
export async function login(q: Queryable, username: string): Promise<PlayerRow> {
  const touched = await q.query(
    'UPDATE players SET last_seen = now() WHERE username = $1 RETURNING id, username',
    [username],
  );
  if (touched.rows[0]) return touched.rows[0] as unknown as PlayerRow;

  try {
    const created = await q.query(
      'INSERT INTO players (username) VALUES ($1) RETURNING id, username',
      [username],
    );
    return created.rows[0] as unknown as PlayerRow;
  } catch {
    // Lost an insert race — the row exists now, so read it.
    const existing = await q.query('SELECT id, username FROM players WHERE username = $1', [
      username,
    ]);
    return existing.rows[0] as unknown as PlayerRow;
  }
}

/** Load (creating if absent) a player's progression for one class. */
export async function getProgress(
  q: Queryable,
  playerId: number,
  characterClass: string,
): Promise<Progress> {
  const found = await q.query(
    `SELECT xp, level, kills, deaths, wins, losses
       FROM class_progress WHERE player_id = $1 AND character_class = $2`,
    [playerId, characterClass],
  );
  const row = found.rows[0];
  if (row) {
    return {
      xp: num(row.xp),
      level: num(row.level),
      kills: num(row.kills),
      deaths: num(row.deaths),
      wins: num(row.wins),
      losses: num(row.losses),
    };
  }
  await q.query('INSERT INTO class_progress (player_id, character_class) VALUES ($1, $2)', [
    playerId,
    characterClass,
  ]);
  return { xp: 0, level: 1, kills: 0, deaths: 0, wins: 0, losses: 0 };
}

/** Apply stat deltas and recompute level. Returns the new totals. */
export async function recordResult(
  q: Queryable,
  playerId: number,
  characterClass: string,
  delta: ResultDelta,
): Promise<Progress> {
  await getProgress(q, playerId, characterClass); // ensure the row exists
  const updated = await q.query(
    `UPDATE class_progress
        SET xp = xp + $3, kills = kills + $4, deaths = deaths + $5,
            wins = wins + $6, losses = losses + $7
      WHERE player_id = $1 AND character_class = $2
      RETURNING xp, kills, deaths, wins, losses`,
    [playerId, characterClass, delta.xp, delta.kills, delta.deaths, delta.wins, delta.losses],
  );
  const row = updated.rows[0]!;
  const xp = num(row.xp);
  const level = levelForXp(xp);
  await q.query(
    'UPDATE class_progress SET level = $3 WHERE player_id = $1 AND character_class = $2',
    [playerId, characterClass, level],
  );
  return {
    xp,
    level,
    kills: num(row.kills),
    deaths: num(row.deaths),
    wins: num(row.wins),
    losses: num(row.losses),
  };
}
