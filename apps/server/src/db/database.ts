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

/** Schema, as individual statements (idempotent) so it runs on every boot. */
export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS players (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
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

/** Create the tables if they don't exist. */
export async function migrate(q: Queryable): Promise<void> {
  for (const statement of SCHEMA) await q.query(statement);
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
