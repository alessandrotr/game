import { getCosmetic, isCharacterClass, type CharacterClass } from '@arena/shared';
import type { TokenClaims } from '../../auth.js';

/**
 * The join-identity parsing shared by every room. Each room's `onJoin` derives a
 * display name, character class, skin and session key from the same (untrusted)
 * client options + the (authoritative) token claims; centralizing it here keeps
 * the rules — and the `MAX_NAME_LENGTH` cap — in one place.
 */

/** Maximum accepted display-name length (one cap for every room). */
export const MAX_NAME_LENGTH = 24;

/** Maximum accepted skin-id length. */
const MAX_SKIN_ID_LENGTH = 64;

/** The options a client may pass to `joinOrCreate` / a seat reservation. */
export interface JoinOptions {
  token?: string;
  name?: string;
  characterClass?: string;
  skinId?: string;
  dyeId?: string;
  pedestalId?: string;
  titleId?: string;
  rimId?: string;
  /** Short revision of the player's custom paint for their class ('' = none). */
  paintRev?: string;
  team?: string;
  sessionKey?: string;
}

/**
 * The display name, preferring the authoritative token name over the
 * client-supplied one, falling back to a generic name for unauthenticated joins.
 */
export function resolveName(claims: TokenClaims | null | undefined, options?: JoinOptions): string {
  return (
    claims?.name?.slice(0, MAX_NAME_LENGTH) ||
    (options?.name ?? '').trim().slice(0, MAX_NAME_LENGTH) ||
    'Adventurer'
  );
}

/** The chosen class if valid, otherwise the default warrior. */
export function resolveClass(options?: JoinOptions): CharacterClass {
  return isCharacterClass(options?.characterClass) ? options.characterClass : 'warrior';
}

/** The skin id, coerced to a bounded string. */
export function resolveSkinId(options?: JoinOptions): string {
  return String(options?.skinId ?? '').slice(0, MAX_SKIN_ID_LENGTH);
}

/** A cosmetic id from join options, accepted only if it's a known cosmetic of
 *  the expected type (else ''). Appearance only — ownership is enforced when the
 *  loadout is persisted over HTTP. */
function resolveCosmeticId(id: string | undefined, type: 'dye' | 'pedestal' | 'title' | 'rim'): string {
  const clean = String(id ?? '').slice(0, MAX_SKIN_ID_LENGTH);
  return getCosmetic(clean)?.type === type ? clean : '';
}

/** The equipped dye cosmetic id, validated against the catalog. */
export function resolveDyeId(options?: JoinOptions): string {
  return resolveCosmeticId(options?.dyeId, 'dye');
}

/** The equipped pedestal cosmetic id, validated against the catalog. */
export function resolvePedestalId(options?: JoinOptions): string {
  return resolveCosmeticId(options?.pedestalId, 'pedestal');
}

/** The equipped title cosmetic id, validated against the catalog. */
export function resolveTitleId(options?: JoinOptions): string {
  return resolveCosmeticId(options?.titleId, 'title');
}

/** The equipped avatar-rim cosmetic id, validated against the catalog. Falls back
 *  to the standard frame so every player always has a rim. */
export function resolveRimId(options?: JoinOptions): string {
  return resolveCosmeticId(options?.rimId, 'rim') || 'rim.standard';
}

/** The tab/session key (used for single-session enforcement), coerced to string. */
export function sessionKeyOf(options?: JoinOptions): string {
  return String(options?.sessionKey ?? '');
}

/** The client-reported paint revision (appearance only), bounded. */
export function resolvePaintRev(options?: JoinOptions): string {
  return String(options?.paintRev ?? '').slice(0, 32);
}
