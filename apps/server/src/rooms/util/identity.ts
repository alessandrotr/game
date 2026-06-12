import { isCharacterClass, type CharacterClass } from '@arena/shared';
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

/** The tab/session key (used for single-session enforcement), coerced to string. */
export function sessionKeyOf(options?: JoinOptions): string {
  return String(options?.sessionKey ?? '');
}
