import { beforeEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { SCHEMA, type Queryable } from './database';
import { getProgress, levelForXp, login, recordResult } from './players';

/** A fresh in-memory Postgres with the schema applied. */
async function freshDb(): Promise<Queryable> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Queryable;
  for (const stmt of SCHEMA) await pool.query(stmt);
  return pool;
}

describe('levelForXp', () => {
  it('follows the quadratic curve', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    expect(levelForXp(900)).toBe(4);
  });
});

describe('player repository (pg-mem)', () => {
  let db: Queryable;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('login is find-or-create (idempotent by username)', async () => {
    const a = await login(db, 'Gandalf');
    const b = await login(db, 'Gandalf');
    expect(a.id).toBe(b.id);
    expect(a.username).toBe('Gandalf');
    const c = await login(db, 'Merlin');
    expect(c.id).not.toBe(a.id);
  });

  it('getProgress creates a default row then returns it', async () => {
    const p = await login(db, 'Mage1');
    const prog = await getProgress(db, p.id, 'mage');
    expect(prog).toMatchObject({ xp: 0, level: 1, kills: 0, deaths: 0 });
    // Second call returns the same (still default) row.
    expect(await getProgress(db, p.id, 'mage')).toMatchObject({ xp: 0, level: 1 });
  });

  it('recordResult accumulates stats and recomputes level', async () => {
    const p = await login(db, 'Warrior1');
    await recordResult(db, p.id, 'warrior', { xp: 60, kills: 1, deaths: 0, wins: 0, losses: 0 });
    let prog = await recordResult(db, p.id, 'warrior', {
      xp: 60,
      kills: 1,
      deaths: 1,
      wins: 0,
      losses: 0,
    });
    expect(prog).toMatchObject({ xp: 120, level: 2, kills: 2, deaths: 1 });

    // Cross the level-3 threshold (400 xp).
    prog = await recordResult(db, p.id, 'warrior', {
      xp: 300,
      kills: 0,
      deaths: 0,
      wins: 1,
      losses: 0,
    });
    expect(prog).toMatchObject({ xp: 420, level: 3, wins: 1 });
  });

  it('tracks progression per class independently', async () => {
    const p = await login(db, 'Multi');
    await recordResult(db, p.id, 'mage', { xp: 500, kills: 3, deaths: 0, wins: 0, losses: 0 });
    const warrior = await getProgress(db, p.id, 'warrior');
    expect(warrior).toMatchObject({ xp: 0, level: 1, kills: 0 });
    const mage = await getProgress(db, p.id, 'mage');
    expect(mage).toMatchObject({ xp: 500, kills: 3 });
  });
});
