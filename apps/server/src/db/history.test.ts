import { beforeEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { SCHEMA, type Queryable } from './database';
import { createAccount } from './players';
import { getRunHistory, recordRunHistory, MAX_PER_CLASS_MODE, type RunHistoryInput } from './history';

async function freshDb(): Promise<Queryable> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Queryable;
  for (const stmt of SCHEMA) await pool.query(stmt);
  return pool;
}

const zombieRun = (over: Partial<RunHistoryInput> = {}): RunHistoryInput => ({
  playerId: 0,
  characterClass: 'warrior',
  mode: 'zombie',
  outcome: null,
  durationSec: 120,
  kills: 80,
  deaths: 0,
  wave: 9,
  xp: 500,
  ...over,
});

describe('run history (pg-mem)', () => {
  let db: Queryable;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('records runs and returns them newest-first for the class', async () => {
    const p = await createAccount(db, 'h@example.com', 'H', 'salt:hash');
    await recordRunHistory(db, zombieRun({ playerId: p.id, wave: 5 }));
    await recordRunHistory(db, zombieRun({ playerId: p.id, wave: 11 }));
    await recordRunHistory(db, {
      ...zombieRun({ playerId: p.id }),
      mode: 'arena',
      outcome: 'win',
      kills: 5,
      deaths: 3,
      wave: 0,
    });

    const runs = await getRunHistory(db, p.id, 'warrior');
    expect(runs).toHaveLength(3);
    // Newest first: the arena win was inserted last.
    expect(runs[0]).toMatchObject({ mode: 'arena', outcome: 'win', kills: 5, deaths: 3 });
    expect(runs[1]).toMatchObject({ mode: 'zombie', wave: 11 });
    expect(runs[2]).toMatchObject({ mode: 'zombie', wave: 5 });
    // Other classes are isolated.
    expect(await getRunHistory(db, p.id, 'mage')).toHaveLength(0);
  });

  it(
    'prunes to the most recent N per class+mode',
    async () => {
      const p = await createAccount(db, 'p@example.com', 'P', 'salt:hash');
      for (let i = 0; i < MAX_PER_CLASS_MODE + 5; i++) {
        await recordRunHistory(db, zombieRun({ playerId: p.id, wave: i }));
      }
      const runs = await getRunHistory(db, p.id, 'warrior');
      expect(runs).toHaveLength(MAX_PER_CLASS_MODE);
      // The oldest (low wave numbers) were pruned; the newest survives.
      expect(runs[0]?.wave).toBe(MAX_PER_CLASS_MODE + 4);
      expect(runs.some((r) => r.wave === 0)).toBe(false);
    },
    // pg-mem is slow running 55 sequential insert+prune cycles; real Postgres is fine.
    20000,
  );
});
