import {
  levelForXp,
  type ClassProgressView,
  type LeaderboardCategory,
  type LeaderboardEntry,
} from '@arena/shared';
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

/** One zombie-survival run's contribution to a class's lifetime stats. All fields
 *  are additive totals except {@link bestWave}, which is kept as a running maximum. */
export interface ZombieRunDelta {
  /** Completed runs (normally 1 per flush). */
  runs: number;
  /** Deepest wave reached this run (folded with GREATEST, not summed). */
  bestWave: number;
  /** Seconds survived this run. */
  timeSurvived: number;
  killsNormal: number;
  killsSprinter: number;
  killsFat: number;
  killsMiniboss: number;
  killsTitan: number;
  perksPicked: number;
  altars: number;
  doors: number;
  traps: number;
  damageDealt: number;
  damageTaken: number;
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

/**
 * Resolve a guest's persistent player id, creating the row on first use (their
 * first match). Guest rows carry no email/password (`is_guest = true`) and are
 * keyed by the random `gid` from the guest token. Registration later upgrades
 * the same row in place ({@link upgradeGuest}), so progress earned as a guest is
 * preserved.
 */
export async function ensureGuestAccount(q: Queryable, gid: string, name: string): Promise<number> {
  const existing = await findGuestId(q, gid);
  if (existing !== null) return existing;
  try {
    const created = await q.query(
      'INSERT INTO players (username, is_guest, guest_id) VALUES ($1, true, $2) RETURNING id',
      [name, gid],
    );
    return num(created.rows[0]!.id);
  } catch (err) {
    // Lost the insert race for this gid (e.g. two tabs entering at once) — re-read.
    const raced = await findGuestId(q, gid);
    if (raced !== null) return raced;
    throw err;
  }
}

/** The player id backing a guest's `gid`, or null if they have no row yet (never
 *  entered a match). Read-only — never creates a row. */
export async function findGuestId(q: Queryable, gid: string): Promise<number | null> {
  const res = await q.query('SELECT id FROM players WHERE guest_id = $1', [gid]);
  const row = res.rows[0];
  return row ? num(row.id) : null;
}

/**
 * Upgrade a guest row into a full account in place: attach email/username/
 * password and clear the guest flag. The `id` is unchanged, so all class
 * progress earned as a guest carries over. Throws {@link EmailTakenError} if the
 * email already belongs to another account.
 */
export async function upgradeGuest(
  q: Queryable,
  playerId: number,
  email: string,
  username: string,
  passwordHash: string,
): Promise<AccountRow> {
  if (await findByEmail(q, email)) throw new EmailTakenError();
  try {
    const updated = await q.query(
      `UPDATE players
          SET email = $2, username = $3, password_hash = $4, is_guest = false, guest_id = NULL
        WHERE id = $1
        RETURNING id, username`,
      [playerId, email, username, passwordHash],
    );
    const row = updated.rows[0]!;
    return { id: num(row.id), username: String(row.username) };
  } catch (err) {
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

/** Fold one zombie-survival run into a class's lifetime stats: additive for the
 *  totals, GREATEST for the best-wave high score. No-op-safe (ensures the row). */
export async function recordZombieRun(
  q: Queryable,
  playerId: number,
  characterClass: string,
  delta: ZombieRunDelta,
): Promise<void> {
  await getProgress(q, playerId, characterClass); // ensure the row exists
  await q.query(
    `UPDATE class_progress
        SET zombie_runs = zombie_runs + $3,
            zombie_best_wave = GREATEST(zombie_best_wave, $4),
            zombie_time_survived = zombie_time_survived + $5,
            zombie_kills_normal = zombie_kills_normal + $6,
            zombie_kills_sprinter = zombie_kills_sprinter + $7,
            zombie_kills_fat = zombie_kills_fat + $8,
            zombie_kills_miniboss = zombie_kills_miniboss + $9,
            zombie_kills_titan = zombie_kills_titan + $10,
            zombie_perks_picked = zombie_perks_picked + $11,
            zombie_altars = zombie_altars + $12,
            zombie_doors = zombie_doors + $13,
            zombie_traps = zombie_traps + $14,
            zombie_damage_dealt = zombie_damage_dealt + $15,
            zombie_damage_taken = zombie_damage_taken + $16
      WHERE player_id = $1 AND character_class = $2`,
    [
      playerId,
      characterClass,
      delta.runs,
      delta.bestWave,
      delta.timeSurvived,
      delta.killsNormal,
      delta.killsSprinter,
      delta.killsFat,
      delta.killsMiniboss,
      delta.killsTitan,
      delta.perksPicked,
      delta.altars,
      delta.doors,
      delta.traps,
      delta.damageDealt,
      delta.damageTaken,
    ],
  );
}

/**
 * The ORDER BY clause for each leaderboard category. The primary key is the
 * category's own metric; the rest are stable, sensible tiebreakers. These are
 * fixed literals (never user input) so they're safe to interpolate into SQL.
 */
const ORDER_BY: Record<LeaderboardCategory, string> = {
  wins: 'cp.wins DESC, cp.xp DESC, cp.kills DESC',
  losses: 'cp.losses DESC, cp.deaths DESC, cp.xp DESC',
  kills: 'cp.kills DESC, cp.xp DESC, cp.wins DESC',
  deaths: 'cp.deaths DESC, cp.xp DESC, cp.kills DESC',
  level: 'cp.level DESC, cp.xp DESC, cp.wins DESC',
};

/**
 * A leaderboard: top class-progress rows (one per player+class), ranked by the
 * given `category`. Each row is a player's record on a single class. The same
 * rows back every category — only the sort changes — so a strong player can
 * appear on several boards (and more than once if they play multiple classes).
 */
export async function topPlayers(
  q: Queryable,
  category: LeaderboardCategory = 'wins',
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const orderBy = ORDER_BY[category] ?? ORDER_BY.wins;
  const res = await q.query(
    `SELECT p.id, p.username, p.cosmetics_loadout, cp.character_class, cp.level, cp.wins, cp.losses, cp.kills, cp.deaths
       FROM class_progress cp
       JOIN players p ON p.id = cp.player_id
      ORDER BY ${orderBy}
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((row) => {
    const characterClass = String(row.character_class ?? '');
    const equipped = loadoutFor(row.cosmetics_loadout, characterClass);
    return {
      name: String(row.username ?? 'Adventurer'),
      characterClass,
      level: num(row.level),
      wins: num(row.wins),
      losses: num(row.losses),
      kills: num(row.kills),
      deaths: num(row.deaths),
      pid: num(row.id),
      skinId: equipped.skinId,
      dyeId: equipped.dyeId,
      titleId: equipped.titleId,
    };
  });
}

/** Pull a class's equipped skin/dye out of a raw `cosmetics_loadout` JSONB value
 *  (a class → loadout map; pg may hand it back parsed or as a string). Best-effort:
 *  anything malformed yields no ids, so the podium falls back to the default look. */
function loadoutFor(
  raw: unknown,
  characterClass: string,
): { skinId?: string; dyeId?: string; titleId?: string } {
  let map: Record<string, unknown> = {};
  try {
    map = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    return {};
  }
  const loadout = map?.[characterClass] as
    | { skinId?: unknown; dyeId?: unknown; titleId?: unknown }
    | undefined;
  if (!loadout || typeof loadout !== 'object') return {};
  return {
    skinId: typeof loadout.skinId === 'string' ? loadout.skinId : undefined,
    dyeId: typeof loadout.dyeId === 'string' ? loadout.dyeId : undefined,
    titleId: typeof loadout.titleId === 'string' ? loadout.titleId : undefined,
  };
}

/**
 * Every class this account has progressed on. Classes never played are absent
 * (the caller defaults them to level 1) — used to show per-class levels on the
 * character-select screen.
 */
export async function allProgress(q: Queryable, playerId: number): Promise<ClassProgressView[]> {
  const res = await q.query(
    `SELECT character_class, level, xp, kills, deaths, wins, losses,
            zombie_runs, zombie_best_wave, zombie_time_survived,
            zombie_kills_normal, zombie_kills_sprinter, zombie_kills_fat,
            zombie_kills_miniboss, zombie_kills_titan,
            zombie_perks_picked, zombie_altars, zombie_doors, zombie_traps,
            zombie_damage_dealt, zombie_damage_taken
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
    zombie: {
      runs: num(row.zombie_runs),
      bestWave: num(row.zombie_best_wave),
      timeSurvived: num(row.zombie_time_survived),
      killsNormal: num(row.zombie_kills_normal),
      killsSprinter: num(row.zombie_kills_sprinter),
      killsFat: num(row.zombie_kills_fat),
      killsMiniboss: num(row.zombie_kills_miniboss),
      killsTitan: num(row.zombie_kills_titan),
      perksPicked: num(row.zombie_perks_picked),
      altars: num(row.zombie_altars),
      doors: num(row.zombie_doors),
      traps: num(row.zombie_traps),
      damageDealt: num(row.zombie_damage_dealt),
      damageTaken: num(row.zombie_damage_taken),
    },
  }));
}
