import { beforeEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { levelForXp } from '@arena/shared';
import { SCHEMA, type Queryable } from './database';
import {
  allProgress,
  createAccount,
  EmailTakenError,
  ensureGuestAccount,
  findByEmail,
  findGuestId,
  getProgress,
  recordResult,
  topPlayers,
  upgradeGuest,
} from './players';

/** Register a test account with a throwaway password hash. */
const account = (db: Queryable, email: string, username: string) =>
  createAccount(db, email, username, 'salt:hash');

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

  it('createAccount stores the account and findByEmail finds it case-insensitively', async () => {
    const a = await account(db, 'gandalf@shire.io', 'Gandalf');
    const found = await findByEmail(db, 'gandalf@shire.io');
    expect(found?.id).toBe(a.id);
    expect(found?.username).toBe('Gandalf');
    expect(found?.passwordHash).toBe('salt:hash');
    // Different email = different account, even with the same display name.
    const c = await account(db, 'gandalf@white.io', 'Gandalf');
    expect(c.id).not.toBe(a.id);
  });

  it('createAccount rejects a duplicate email', async () => {
    await account(db, 'dup@example.com', 'First');
    await expect(account(db, 'dup@example.com', 'Second')).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('getProgress creates a default row then returns it', async () => {
    const p = await account(db, 'mage@example.com', 'Mage1');
    const prog = await getProgress(db, p.id, 'mage');
    expect(prog).toMatchObject({ xp: 0, level: 1, kills: 0, deaths: 0 });
    // Second call returns the same (still default) row.
    expect(await getProgress(db, p.id, 'mage')).toMatchObject({ xp: 0, level: 1 });
  });

  it('recordResult accumulates stats and recomputes level', async () => {
    const p = await account(db, 'warrior@example.com', 'Warrior1');
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
    const p = await account(db, 'multi@example.com', 'Multi');
    await recordResult(db, p.id, 'mage', { xp: 500, kills: 3, deaths: 0, wins: 0, losses: 0 });
    const warrior = await getProgress(db, p.id, 'warrior');
    expect(warrior).toMatchObject({ xp: 0, level: 1, kills: 0 });
    const mage = await getProgress(db, p.id, 'mage');
    expect(mage).toMatchObject({ xp: 500, kills: 3 });

    // allProgress returns a row per class touched (mage played + warrior, whose
    // default row was created by the getProgress call above).
    const all = await allProgress(db, p.id);
    expect(all.map((r) => r.characterClass).sort()).toEqual(['mage', 'warrior']);
    expect(all.find((r) => r.characterClass === 'mage')).toMatchObject({ xp: 500, kills: 3 });
  });

  it('ensureGuestAccount creates a row once and is idempotent per gid', async () => {
    const id = await ensureGuestAccount(db, 'gid-1', 'Guest-AAAA');
    // Same gid resolves to the same row (no duplicate created).
    expect(await ensureGuestAccount(db, 'gid-1', 'Guest-AAAA')).toBe(id);
    expect(await findGuestId(db, 'gid-1')).toBe(id);
    // An unknown gid has no row yet (read-only — nothing created).
    expect(await findGuestId(db, 'gid-unknown')).toBeNull();
  });

  it('upgradeGuest converts the guest row in place, keeping its id and progress', async () => {
    const id = await ensureGuestAccount(db, 'gid-2', 'Guest-BBBB');
    await recordResult(db, id, 'mage', { xp: 250, kills: 4, deaths: 1, wins: 1, losses: 0 });

    const upgraded = await upgradeGuest(db, id, 'claimed@example.com', 'RealName', 'salt:hash');
    expect(upgraded.id).toBe(id); // same row → progress carries over
    expect(upgraded.username).toBe('RealName');

    // Now a normal account: findable by email, no longer a guest.
    const found = await findByEmail(db, 'claimed@example.com');
    expect(found?.id).toBe(id);
    expect(await findGuestId(db, 'gid-2')).toBeNull(); // guest_id cleared
    expect(await getProgress(db, id, 'mage')).toMatchObject({ xp: 250, kills: 4 });
  });

  it('upgradeGuest rejects an email already registered to another account', async () => {
    await account(db, 'taken@example.com', 'Owner');
    const id = await ensureGuestAccount(db, 'gid-3', 'Guest-CCCC');
    await expect(
      upgradeGuest(db, id, 'taken@example.com', 'Imposter', 'salt:hash'),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('topPlayers ranks by wins then xp, one row per player+class', async () => {
    const ace = await account(db, 'ace@example.com', 'Ace');
    const rook = await account(db, 'rook@example.com', 'Rook');
    // Rook has more wins; Ace has more xp but fewer wins.
    await recordResult(db, ace.id, 'mage', { xp: 900, kills: 5, deaths: 2, wins: 1, losses: 1 });
    await recordResult(db, rook.id, 'warrior', { xp: 100, kills: 2, deaths: 4, wins: 3, losses: 0 });
    // A second class for Ace gets its own row.
    await recordResult(db, ace.id, 'archer', { xp: 50, kills: 1, deaths: 0, wins: 0, losses: 0 });

    const board = await topPlayers(db, 10);
    expect(board).toHaveLength(3);
    // Wins dominate: Rook (3) first, then Ace's mage (1), then Ace's archer (0).
    expect(board[0]).toMatchObject({ name: 'Rook', characterClass: 'warrior', wins: 3 });
    expect(board[1]).toMatchObject({ name: 'Ace', characterClass: 'mage', wins: 1 });
    expect(board[2]).toMatchObject({ name: 'Ace', characterClass: 'archer', wins: 0 });
  });
});
