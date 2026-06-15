import { beforeEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { DEFAULT_OWNED } from '@arena/shared';
import { SCHEMA, type Queryable } from './database';
import { createAccount } from './players';
import { getCosmetics, saveCosmetics } from './cosmetics';

/** A fresh in-memory Postgres with the schema applied. */
async function freshDb(): Promise<Queryable> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Queryable;
  for (const stmt of SCHEMA) await pool.query(stmt);
  return pool;
}

describe('cosmetics repository (per class)', () => {
  let db: Queryable;
  let pid: number;

  beforeEach(async () => {
    db = await freshDb();
    const acc = await createAccount(db, 'a@b.com', 'Player', 'salt:hash');
    pid = acc.id;
  });

  it('returns an empty state for a fresh account (defaults applied client-side)', async () => {
    expect(await getCosmetics(db, pid)).toEqual({});
  });

  it('persists a per-class unlock and round-trips it', async () => {
    await saveCosmetics(db, pid, { warrior: { owned: [...DEFAULT_OWNED, 'pedestal.gold'], loadout: {} } });
    const state = await getCosmetics(db, pid);
    expect(state.warrior?.owned).toContain('pedestal.gold');
  });

  it('keeps a class wardrobe isolated from other classes', async () => {
    await saveCosmetics(db, pid, { warrior: { owned: [...DEFAULT_OWNED, 'pedestal.gold'], loadout: { pedestalId: 'pedestal.gold' } } });
    const state = await getCosmetics(db, pid);
    expect(state.warrior?.loadout.pedestalId).toBe('pedestal.gold');
    // The mage never unlocked it — and gets no entry at all.
    expect(state.mage).toBeUndefined();
  });

  it('drops a loadout entry that references a cosmetic the class does not own', async () => {
    const state = await saveCosmetics(db, pid, {
      warrior: { owned: [...DEFAULT_OWNED], loadout: { pedestalId: 'pedestal.gold' } },
    });
    expect(state.warrior?.loadout.pedestalId).toBe('');
  });

  it('rejects a cosmetic equipped in the wrong slot', async () => {
    const state = await saveCosmetics(db, pid, {
      warrior: { owned: [...DEFAULT_OWNED, 'pedestal.gold'], loadout: { titleId: 'pedestal.gold' } },
    });
    expect(state.warrior?.loadout.titleId).toBe('title.novice'); // falls back to the default title
  });

  it('ignores unknown cosmetic ids and unknown classes', async () => {
    const state = await saveCosmetics(db, pid, {
      warrior: { owned: ['not.a.real.id'], loadout: {} },
      wizard: { owned: ['pedestal.gold'], loadout: {} },
    });
    expect(state.warrior?.owned).not.toContain('not.a.real.id');
    expect(state.warrior?.owned.sort()).toEqual([...DEFAULT_OWNED].sort());
    expect((state as Record<string, unknown>).wizard).toBeUndefined();
  });

  // pedestal.pulse is rare → unlocks at RARITY_UNLOCK_LEVEL.rare (15).
  it('rejects claiming an item above the class level', async () => {
    const state = await saveCosmetics(
      db,
      pid,
      { warrior: { owned: [...DEFAULT_OWNED, 'pedestal.pulse'], loadout: {} } },
      { warrior: 10 }, // below the rare unlock level
    );
    expect(state.warrior?.owned).not.toContain('pedestal.pulse');
  });

  it('allows claiming an item once the class level is high enough', async () => {
    const state = await saveCosmetics(
      db,
      pid,
      { warrior: { owned: [...DEFAULT_OWNED, 'pedestal.pulse'], loadout: { pedestalId: 'pedestal.pulse' } } },
      { warrior: 15 },
    );
    expect(state.warrior?.owned).toContain('pedestal.pulse');
    expect(state.warrior?.loadout.pedestalId).toBe('pedestal.pulse');
  });

  it('keeps starter (default) items even at level 1', async () => {
    const state = await saveCosmetics(db, pid, { warrior: { owned: [...DEFAULT_OWNED], loadout: {} } }, { warrior: 1 });
    expect(state.warrior?.owned.sort()).toEqual([...DEFAULT_OWNED].sort());
  });
});
