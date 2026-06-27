import pg from 'pg';

/**
 * Persistence layer (Phase 13). Postgres-backed when `DATABASE_URL` is set, and
 * **cleanly disabled otherwise** — so local dev and CI run with zero database
 * setup (progression simply isn't saved). The repository (`players.ts`) is pure
 * over this `Queryable`, so it's unit-tested against an in-memory Postgres.
 */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

let pool: pg.Pool | null = null;

/** The live pool, or null when persistence is disabled. */
export function getPool(): Queryable | null {
  return pool;
}

export function databaseEnabled(): boolean {
  return pool !== null;
}

/**
 * Schema, as individual idempotent statements. Players are real accounts keyed
 * by `email` (unique, case-insensitive — stored lowercased); `username` is the
 * display handle and `password_hash` is a salted scrypt hash.
 */
export const SCHEMA: readonly string[] = [
  // email/password_hash are nullable so guests (is_guest = true, keyed by the
  // random guest_id) can exist without credentials until they register, which
  // upgrades the row in place — see db/players.ts:ensureGuestAccount/upgradeGuest.
  `CREATE TABLE IF NOT EXISTS players (
     id SERIAL PRIMARY KEY,
     email TEXT UNIQUE,
     username TEXT NOT NULL,
     password_hash TEXT,
     is_guest BOOLEAN NOT NULL DEFAULT false,
     guest_id TEXT UNIQUE,
     camera_prefs JSONB,
     cosmetics_owned JSONB,
     cosmetics_loadout JSONB,
     cosmetics_paint JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS class_progress (
     player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     character_class TEXT NOT NULL,
     xp INTEGER NOT NULL DEFAULT 0,
     level INTEGER NOT NULL DEFAULT 1,
     kills INTEGER NOT NULL DEFAULT 0,
     deaths INTEGER NOT NULL DEFAULT 0,
     wins INTEGER NOT NULL DEFAULT 0,
     losses INTEGER NOT NULL DEFAULT 0,
     -- Zombie-survival lifetime stats (accumulated per run; see db/players.ts:recordZombieRun).
     -- 'best_wave' is a running maximum (GREATEST), the rest are additive totals.
     zombie_runs INTEGER NOT NULL DEFAULT 0,
     zombie_best_wave INTEGER NOT NULL DEFAULT 0,
     zombie_time_survived INTEGER NOT NULL DEFAULT 0,
     zombie_kills_normal INTEGER NOT NULL DEFAULT 0,
     zombie_kills_sprinter INTEGER NOT NULL DEFAULT 0,
     zombie_kills_fat INTEGER NOT NULL DEFAULT 0,
     zombie_kills_miniboss INTEGER NOT NULL DEFAULT 0,
     zombie_kills_titan INTEGER NOT NULL DEFAULT 0,
     zombie_perks_picked INTEGER NOT NULL DEFAULT 0,
     zombie_altars INTEGER NOT NULL DEFAULT 0,
     zombie_doors INTEGER NOT NULL DEFAULT 0,
     zombie_traps INTEGER NOT NULL DEFAULT 0,
     zombie_damage_dealt INTEGER NOT NULL DEFAULT 0,
     zombie_damage_taken INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (player_id, character_class)
   )`,
  // Per-run history: one row per finished ranked arena match or zombie co-op run,
  // pruned to the most recent N per (player, class, mode). Backs the champion
  // sheet's History tab. mode = 'arena' | 'zombie'; arena rows carry outcome +
  // kills/deaths, zombie rows carry wave + zombie kills.
  `CREATE TABLE IF NOT EXISTS run_history (
     id SERIAL PRIMARY KEY,
     player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     character_class TEXT NOT NULL,
     mode TEXT NOT NULL,
     outcome TEXT,
     duration_sec INTEGER NOT NULL DEFAULT 0,
     kills INTEGER NOT NULL DEFAULT 0,
     deaths INTEGER NOT NULL DEFAULT 0,
     wave INTEGER NOT NULL DEFAULT 0,
     xp INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS run_history_player ON run_history(player_id, character_class, created_at DESC)`,
  // Persisted chat per channel (e.g. 'town'), so the log survives a room being
  // disposed when empty or a server restart. The last N are replayed on join.
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id SERIAL PRIMARY KEY,
     channel TEXT NOT NULL,
     sender TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS chat_messages_channel_id ON chat_messages(channel, id)`,
];

/**
 * Evolve a pre-existing `players` table (originally device-id-keyed guests) to
 * the email/password account shape. Best-effort: each runs independently and is
 * ignored if it doesn't apply (fresh DB) or the dialect doesn't support it
 * (pg-mem uses SCHEMA directly and never runs these).
 *
 * Old guest rows are left in place but become unusable: `device_id` loses its
 * NOT NULL/uniqueness, and the new account columns are added nullable so the
 * ALTERs succeed against existing data. New accounts always populate them.
 */
const LEGACY_MIGRATIONS: readonly string[] = [
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE players ALTER COLUMN device_id DROP NOT NULL`,
  `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_device_id_key`,
  `DROP INDEX IF EXISTS players_device_id_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS players_email_key ON players(lower(email)) WHERE email IS NOT NULL`,
  // Per-account UI prefs (camera locks). Added to existing account tables.
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS camera_prefs JSONB`,
  // Per-account cosmetics (owned ids + equipped loadout). Added to existing tables.
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS cosmetics_owned JSONB`,
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS cosmetics_loadout JSONB`,
  // Per-account free-form character paint (per class: skin colors + overlay PNGs).
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS cosmetics_paint JSONB`,
  // Guest accounts: a temporary identity (no email/password) created lazily on a
  // guest's first match, upgraded in place when they register. email/password
  // become nullable so guest rows can exist without credentials.
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS guest_id TEXT`,
  `ALTER TABLE players ALTER COLUMN email DROP NOT NULL`,
  `ALTER TABLE players ALTER COLUMN password_hash DROP NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS players_guest_id_key ON players(guest_id) WHERE guest_id IS NOT NULL`,
];

/**
 * Add the zombie-survival stat columns to an existing `class_progress` table.
 * Idempotent (ADD COLUMN IF NOT EXISTS), so a no-op on a fresh DB where SCHEMA
 * already created them. Defaults to 0 so existing rows stay valid.
 */
const STAT_MIGRATIONS: readonly string[] = [
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_runs INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_best_wave INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_time_survived INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_kills_normal INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_kills_sprinter INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_kills_fat INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_kills_miniboss INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_kills_titan INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_perks_picked INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_altars INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_doors INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_traps INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_damage_dealt INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE class_progress ADD COLUMN IF NOT EXISTS zombie_damage_taken INTEGER NOT NULL DEFAULT 0`,
];

/** Create the tables if they don't exist, then apply legacy fixups. */
export async function migrate(q: Queryable): Promise<void> {
  for (const statement of SCHEMA) await q.query(statement);
  for (const statement of [...LEGACY_MIGRATIONS, ...STAT_MIGRATIONS]) {
    try {
      await q.query(statement);
    } catch {
      /* not applicable on a fresh DB / unsupported dialect — ignore */
    }
  }
}

/**
 * Connect (if configured) and migrate. Safe to call once at boot — on any
 * failure it logs and leaves persistence disabled rather than crashing.
 */
export async function initDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Accounts now require a database. For zero-setup local dev, fall back to an
    // ephemeral in-memory Postgres (pg-mem, a devDependency) so register/login
    // work — data is lost on restart. In production (prod-deps only) pg-mem is
    // absent, so this import fails and persistence stays disabled; prod always
    // provides DATABASE_URL anyway.
    try {
      const { newDb } = await import('pg-mem');
      const mem = newDb();
      const { Pool } = mem.adapters.createPg();
      const p = new Pool() as unknown as pg.Pool;
      await migrate(p);
      pool = p;
      console.log('💾  No DATABASE_URL — using an ephemeral in-memory DB (accounts reset on restart).');
    } catch {
      console.log('💾  No DATABASE_URL and no in-memory DB available — accounts are disabled.');
    }
    return;
  }
  // Managed Postgres (Render/Heroku/etc.) usually needs SSL with a self-signed
  // chain; opt out with PGSSL=disable for a local instance.
  const ssl = process.env.PGSSL === 'disable' ? undefined : { rejectUnauthorized: false };
  const p = new pg.Pool({ connectionString: url, ssl });
  try {
    await migrate(p);
    pool = p;
    console.log('💾  Database connected — player progression will be saved.');
  } catch (err) {
    console.error('Database init failed; continuing without persistence:', err);
    await p.end().catch(() => {});
    pool = null;
  }
}

/** Close the pool (graceful shutdown). */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}
