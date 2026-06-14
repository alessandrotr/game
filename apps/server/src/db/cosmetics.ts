import {
  CHARACTER_CLASSES,
  sanitizeState,
  type CharacterClass,
  type CosmeticsState,
  type Loadout,
} from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Per-account, **per-class** cosmetics repository: each character's owned-ids set
 * and equipped {@link Loadout}, stored as two JSONB blobs on the `players` row
 * (`cosmetics_owned` = class → ids, `cosmetics_loadout` = class → loadout). Pure
 * over {@link Queryable}. All sanitization is the shared catalog's, so client and
 * server agree on what's valid (and a character can only equip what it owns).
 */

/** Parse a JSONB column that may arrive as a string or an already-parsed value. */
function parseJson(raw: unknown): Record<string, unknown> {
  const v = typeof raw === 'string' ? safeParse(raw) : raw;
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Read an account's per-class cosmetics, defaulting + sanitizing anything unset. */
export async function getCosmetics(db: Queryable, playerId: number): Promise<CosmeticsState> {
  const { rows } = await db.query(
    'SELECT cosmetics_owned, cosmetics_loadout FROM players WHERE id = $1',
    [playerId],
  );
  const ownedMap = parseJson(rows[0]?.cosmetics_owned);
  const loadoutMap = parseJson(rows[0]?.cosmetics_loadout);
  // Recombine the two columns into the per-class state shape the catalog sanitizes.
  const raw: Record<string, unknown> = {};
  for (const cls of CHARACTER_CLASSES) {
    if (ownedMap[cls] == null && loadoutMap[cls] == null) continue;
    raw[cls] = { owned: ownedMap[cls], loadout: loadoutMap[cls] };
  }
  return sanitizeState(raw);
}

/**
 * Persist an account's per-class cosmetics. The whole state is re-sanitized (so a
 * loadout can never reference an unowned cosmetic, and a skin must match its
 * class), then split back into the two columns. Returns the stored (clean) state.
 */
export async function saveCosmetics(
  db: Queryable,
  playerId: number,
  state: unknown,
): Promise<CosmeticsState> {
  const clean = sanitizeState(state);
  const ownedMap: Partial<Record<CharacterClass, string[]>> = {};
  const loadoutMap: Partial<Record<CharacterClass, Loadout>> = {};
  for (const cls of CHARACTER_CLASSES) {
    const wardrobe = clean[cls];
    if (!wardrobe) continue;
    ownedMap[cls] = wardrobe.owned;
    loadoutMap[cls] = wardrobe.loadout;
  }
  await db.query(
    'UPDATE players SET cosmetics_owned = $2::jsonb, cosmetics_loadout = $3::jsonb WHERE id = $1',
    [playerId, JSON.stringify(ownedMap), JSON.stringify(loadoutMap)],
  );
  return clean;
}
