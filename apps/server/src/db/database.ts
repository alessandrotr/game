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
 * Schema, as individual idempotent statements. Players are identified by a
 * client-generated `device_id` (guest accounts); `username` is display-only.
 */
export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS players (
     id SERIAL PRIMARY KEY,
     device_id TEXT NOT NULL UNIQUE,
     username TEXT NOT NULL,
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
     PRIMARY KEY (player_id, character_class)
   )`,
];

/**
 * Evolve a pre-existing `players` table (the original username-keyed shape) to
 * the device-id shape. Best-effort: each runs independently and is ignored if it
 * doesn't apply (fresh DB) or the dialect doesn't support it (pg-mem tests use
 * SCHEMA directly and never run these).
 */
const LEGACY_MIGRATIONS: readonly string[] = [
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS device_id TEXT`,
  `UPDATE players SET device_id = 'legacy:' || id::text WHERE device_id IS NULL`,
  `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_username_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS players_device_id_key ON players(device_id)`,
];

/** Create the tables if they don't exist, then apply legacy fixups. */
export async function migrate(q: Queryable): Promise<void> {
  for (const statement of SCHEMA) await q.query(statement);
  for (const statement of LEGACY_MIGRATIONS) {
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
    console.log('💾  No DATABASE_URL — progression persistence disabled (in-memory only).');
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
