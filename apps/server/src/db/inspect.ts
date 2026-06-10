/**
 * Read-only DB inspector: prints the tables and current rows. Run locally with
 * the database's connection string (the **External** URL for a remote/Render DB):
 *
 *   DATABASE_URL="postgres://…external…" pnpm --filter @arena/server db:inspect
 *
 * or put it in apps/server/.env and run `pnpm --filter @arena/server db:inspect`.
 */
import { closeDatabase, getPool, initDatabase } from './database.js';

try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env — rely on the inline env var */
}

await initDatabase();
const db = getPool();

if (!db) {
  console.error('No DATABASE_URL set — nothing to inspect.');
  process.exit(1);
}

const tables = await db.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`,
);
console.log(
  '\nTables:',
  tables.rows.map((r) => r.table_name).join(', ') || '(none)',
);

const players = await db.query(
  'SELECT id, email, username, created_at, last_seen FROM players ORDER BY id',
);
console.log('\nplayers:');
console.table(players.rows);

const progress = await db.query(
  `SELECT player_id, character_class, xp, level, kills, deaths, wins, losses
     FROM class_progress ORDER BY player_id, character_class`,
);
console.log('\nclass_progress:');
console.table(progress.rows);

await closeDatabase();
process.exit(0);
