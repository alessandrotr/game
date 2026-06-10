import { levelForXp, type ClassProgressView, type LeaderboardEntry } from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Account + per-class progression repository. Pure over a `Queryable` so it runs
 * against real Postgres in prod and an in-memory one (pg-mem) in dev/tests.
 * Accounts are keyed by email; passwords are hashed by the caller (see auth.ts).
 */

export interface AccountRow {
  id: number;
  username: string;
}

/** Thrown by {@link createAccount} when the email is already registered. */
export class EmailTakenError extends Error {
  constructor() {
    super('email already registered');
    this.name = 'EmailTakenError';
  }
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

/** An account row including its password hash (for login verification). */
export interface AccountWithSecret extends AccountRow {
  passwordHash: string;
}

/**
 * Create a new account. `email` must already be normalized (lowercased) and
 * `passwordHash` produced by auth.ts. Throws {@link EmailTakenError} if the
 * email is already registered.
 */
export async function createAccount(
  q: Queryable,
  email: string,
  username: string,
  passwordHash: string,
): Promise<AccountRow> {
  // Pre-check keeps the common case clean; the unique index is the real guard.
  if (await findByEmail(q, email)) throw new EmailTakenError();
  try {
    const created = await q.query(
      'INSERT INTO players (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [email, username, passwordHash],
    );
    const row = created.rows[0]!;
    return { id: num(row.id), username: String(row.username) };
  } catch (err) {
    // Lost the insert race against another registration with the same email.
    if (await findByEmail(q, email)) throw new EmailTakenError();
    throw err;
  }
}

/** Look up an account by (normalized) email, including its password hash. */
export async function findByEmail(q: Queryable, email: string): Promise<AccountWithSecret | null> {
  const res = await q.query(
    'SELECT id, username, password_hash FROM players WHERE lower(email) = $1',
    [email],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: num(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
  };
}

/** Bump an account's `last_seen` timestamp (best-effort). */
export async function touchLastSeen(q: Queryable, playerId: number): Promise<void> {
  await q.query('UPDATE players SET last_seen = now() WHERE id = $1', [playerId]);
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

/**
 * The global leaderboard: top class-progress rows (one per player+class),
 * ranked by wins then XP. Each row is a player's record on a single class.
 */
export async function topPlayers(q: Queryable, limit = 20): Promise<LeaderboardEntry[]> {
  const res = await q.query(
    `SELECT p.username, cp.character_class, cp.level, cp.wins, cp.losses, cp.kills
       FROM class_progress cp
       JOIN players p ON p.id = cp.player_id
      ORDER BY cp.wins DESC, cp.xp DESC, cp.kills DESC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((row) => ({
    name: String(row.username ?? 'Adventurer'),
    characterClass: String(row.character_class ?? ''),
    level: num(row.level),
    wins: num(row.wins),
    losses: num(row.losses),
    kills: num(row.kills),
  }));
}

/**
 * Every class this account has progressed on. Classes never played are absent
 * (the caller defaults them to level 1) — used to show per-class levels on the
 * character-select screen.
 */
export async function allProgress(q: Queryable, playerId: number): Promise<ClassProgressView[]> {
  const res = await q.query(
    `SELECT character_class, level, xp, kills, deaths, wins, losses
       FROM class_progress WHERE player_id = $1`,
    [playerId],
  );
  return res.rows.map((row) => ({
    characterClass: String(row.character_class ?? '') as ClassProgressView['characterClass'],
    level: num(row.level),
    xp: num(row.xp),
    kills: num(row.kills),
    deaths: num(row.deaths),
    wins: num(row.wins),
    losses: num(row.losses),
  }));
}
