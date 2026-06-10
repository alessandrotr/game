import { beforeEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { SCHEMA, type Queryable } from './database';
import { loadRecentChat, saveChatMessage } from './chat';

async function freshDb(): Promise<Queryable> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Queryable;
  for (const stmt of SCHEMA) await pool.query(stmt);
  return pool;
}

describe('chat persistence (pg-mem)', () => {
  let db: Queryable;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('returns the last N messages per channel in chronological order', async () => {
    for (let i = 1; i <= 6; i++) await saveChatMessage(db, 'town', `u${i}`, `msg ${i}`);
    await saveChatMessage(db, 'arena', 'x', 'other channel');

    const recent = await loadRecentChat(db, 'town', 3);
    // Newest three, oldest-first.
    expect(recent).toEqual([
      { from: 'u4', text: 'msg 4' },
      { from: 'u5', text: 'msg 5' },
      { from: 'u6', text: 'msg 6' },
    ]);
  });

  it('scopes messages to their channel', async () => {
    await saveChatMessage(db, 'town', 'a', 'town hello');
    await saveChatMessage(db, 'arena', 'b', 'arena hello');
    expect(await loadRecentChat(db, 'arena', 50)).toEqual([{ from: 'b', text: 'arena hello' }]);
  });
});
