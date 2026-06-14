/**
 * Cosmetics contract shared by client and server.
 *
 * The store sells nothing yet — every item is a **free claim** (see `cost`,
 * left unset). But the data model is the real one: a catalog of items, and a
 * **per-class** owned set + equipped {@link Loadout} (each character has its own
 * wardrobe). Adding prices later is a one-field change (`cost`) with no churn.
 *
 * IDs are namespaced by type (`skin.*`, `emote.*`, `dye.*`, `pedestal.*`,
 * `title.*`). A skin's id doubles as its client `SkinDefinition` id, so
 * `Player.skinId` carries the cosmetic id directly with no mapping.
 */

import { CHARACTER_CLASSES, type CharacterClass } from './assets.js';

export type CosmeticType = 'skin' | 'emote' | 'dye' | 'pedestal' | 'title';

/** Display tier — drives the card accent in the store. */
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary';

interface BaseCosmetic {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  rarity: CosmeticRarity;
  /** Owned by every account from the start (the starter set). */
  default?: boolean;
  /** Future economy: soft-currency price. Unset = free to claim for now. */
  cost?: number;
}

/** A full character look. Class-bound; its id is also the client skin id. */
export interface SkinCosmetic extends BaseCosmetic {
  type: 'skin';
  characterClass: CharacterClass;
}

/** A dance/gesture bound to a number key. `anim` must be a rigged clip. */
export interface EmoteCosmetic extends BaseCosmetic {
  type: 'emote';
  anim: string;
}

/** A recolor: a body tint (visible on rigged models too) plus optional
 *  per-part overrides for placeholder bodies. Applied on top of the skin. */
export interface DyeCosmetic extends BaseCosmetic {
  type: 'dye';
  /** Primary tint, multiplied into rigged-model materials. */
  color: string;
  /** Part-name → hex color overrides for placeholder bodies. */
  recolor?: Record<string, string>;
}

/** Visual style of a pedestal — the client maps each to a (shader) renderer.
 *  `ring` is the plain glowing rune circle; the rest are animated effects. */
export type PedestalEffect = 'ring' | 'pulse' | 'aurora' | 'holo' | 'vortex' | 'prism';

/** The glowing circle under the avatar in the portrait. */
export interface PedestalCosmetic extends BaseCosmetic {
  type: 'pedestal';
  /** Primary color. */
  color: string;
  /** Secondary color, for multi-tone effects (aurora/vortex gradients). */
  color2?: string;
  /** Visual style (defaults to `ring`). */
  effect?: PedestalEffect;
}

/** A flavor title shown under the player name. */
export interface TitleCosmetic extends BaseCosmetic {
  type: 'title';
  text: string;
}

export type Cosmetic =
  | SkinCosmetic
  | EmoteCosmetic
  | DyeCosmetic
  | PedestalCosmetic
  | TitleCosmetic;

/**
 * One character's equipped cosmetics. Ids reference {@link COSMETICS}; an empty
 * string means "none / default look". `emotes` is ordered — index 0 binds to
 * number key 1, and so on. Cosmetics are owned and equipped **per class**, so
 * each character keeps its own wardrobe (see {@link CosmeticsState}).
 */
export interface Loadout {
  skinId: string;
  emotes: string[];
  dyeId: string;
  pedestalId: string;
  titleId: string;
}

// ---------------------------------------------------------------------------
// Catalog
//
// Skins and dyes are deliberately absent for now — they'll be added gradually
// with real art/values. The skin/dye *types* and equip plumbing stay in place
// so adding catalog entries later is all it takes. Only pedestals, emotes, and
// titles ship today.
// ---------------------------------------------------------------------------

const EMOTES: EmoteCosmetic[] = [
  {
    id: 'emote.dance1',
    type: 'emote',
    anim: 'dance1',
    name: 'Victory Jig',
    description: 'A celebratory shuffle.',
    rarity: 'common',
    default: true,
  },
  {
    id: 'emote.dance2',
    type: 'emote',
    anim: 'dance2',
    name: 'Groove',
    description: 'Loosen up between rounds.',
    rarity: 'common',
    default: true,
  },
];

const PEDESTALS: PedestalCosmetic[] = [
  // Plain glowing runes (cheap, classic).
  { id: 'pedestal.gold', type: 'pedestal', effect: 'ring', color: '#e8b24a', name: 'Golden Rune', description: 'A warm gilded ring.', rarity: 'common' },
  { id: 'pedestal.crimson', type: 'pedestal', effect: 'ring', color: '#d6435a', name: 'Crimson Rune', description: 'A smoldering red circle.', rarity: 'common' },
  { id: 'pedestal.azure', type: 'pedestal', effect: 'ring', color: '#4a8bff', name: 'Azure Rune', description: 'A glacial blue circle.', rarity: 'common' },
  { id: 'pedestal.emerald', type: 'pedestal', effect: 'ring', color: '#3fb87a', name: 'Emerald Rune', description: 'A living green circle.', rarity: 'common' },
  // Animated, shader-driven showpieces.
  { id: 'pedestal.pulse', type: 'pedestal', effect: 'pulse', color: '#22e1ff', name: 'Pulse Core', description: 'Concentric energy waves ripple outward beneath you.', rarity: 'rare' },
  { id: 'pedestal.holo', type: 'pedestal', effect: 'holo', color: '#27e0c8', name: 'Hologrid', description: 'A flickering holographic deck of scanlines.', rarity: 'rare' },
  { id: 'pedestal.aurora', type: 'pedestal', effect: 'aurora', color: '#3fb87a', color2: '#4a8bff', name: 'Aurora Veil', description: 'Northern lights drift in a slow ribbon.', rarity: 'epic' },
  { id: 'pedestal.vortex', type: 'pedestal', effect: 'vortex', color: '#9a6cff', color2: '#ff4d8d', name: 'Singularity', description: 'A spiral of light winds into the core.', rarity: 'legendary' },
  { id: 'pedestal.prism', type: 'pedestal', effect: 'prism', color: '#ff4d8d', name: 'Prismatica', description: 'A rotating spectrum of pure, shifting color.', rarity: 'legendary' },
];

const TITLES: TitleCosmetic[] = [
  { id: 'title.novice', type: 'title', text: 'Novice', name: 'Novice', description: 'Everyone starts somewhere.', rarity: 'common', default: true },
  { id: 'title.gladiator', type: 'title', text: 'Gladiator', name: 'Gladiator', description: 'Blooded in the arena.', rarity: 'common' },
  { id: 'title.champion', type: 'title', text: 'Champion', name: 'Champion', description: 'A proven victor.', rarity: 'rare' },
  { id: 'title.warlord', type: 'title', text: 'Warlord', name: 'Warlord', description: 'Feared across the field.', rarity: 'epic' },
  { id: 'title.legend', type: 'title', text: 'Legend', name: 'Legend', description: 'Spoken of in hushed tones.', rarity: 'legendary' },
];

/** The full cosmetics catalog, in display order within each type. */
export const COSMETICS: readonly Cosmetic[] = [...EMOTES, ...PEDESTALS, ...TITLES];

const BY_ID = new Map<string, Cosmetic>(COSMETICS.map((c) => [c.id, c]));

/** Look up a cosmetic by id (undefined if unknown). */
export function getCosmetic(id: string): Cosmetic | undefined {
  return BY_ID.get(id);
}

/** Narrowing helper: the cosmetic of a given type, or undefined. */
export function getCosmeticOfType<T extends CosmeticType>(
  id: string,
  type: T,
): Extract<Cosmetic, { type: T }> | undefined {
  const c = BY_ID.get(id);
  return c && c.type === type ? (c as Extract<Cosmetic, { type: T }>) : undefined;
}

/** Every cosmetic of a type, in catalog order. */
export function cosmeticsOfType<T extends CosmeticType>(type: T): Extract<Cosmetic, { type: T }>[] {
  return COSMETICS.filter((c) => c.type === type) as Extract<Cosmetic, { type: T }>[];
}

/** Ids every character owns from the start (the `default` items). */
export const DEFAULT_OWNED: readonly string[] = COSMETICS.filter((c) => c.default).map((c) => c.id);

/** A fresh character's loadout: starter emotes bound, default title, base look. */
export const DEFAULT_LOADOUT: Loadout = {
  skinId: '',
  emotes: EMOTES.filter((e) => e.default).map((e) => e.id),
  dyeId: '',
  pedestalId: '',
  titleId: 'title.novice',
};

/** Max emotes bindable to number keys (1..N). */
export const MAX_EMOTE_SLOTS = 6;

/** One character's wardrobe: the ids it has unlocked + what it has equipped. */
export interface ClassCosmetics {
  owned: string[];
  loadout: Loadout;
}

/**
 * An account's cosmetics, **keyed by class** — each character unlocks and equips
 * its own items independently. A class absent from the map has the defaults
 * (see {@link defaultClassCosmetics}).
 */
export type CosmeticsState = Partial<Record<CharacterClass, ClassCosmetics>>;

/** A fresh character's wardrobe (starter items owned, defaults equipped). */
export function defaultClassCosmetics(): ClassCosmetics {
  return { owned: [...DEFAULT_OWNED], loadout: { ...DEFAULT_LOADOUT } };
}

/**
 * Coerce an untrusted `owned` list into known cosmetic ids, always including
 * the defaults. Used on both sides of the wire.
 */
export function sanitizeOwned(raw: unknown): string[] {
  const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  const set = new Set<string>(DEFAULT_OWNED);
  for (const id of ids) if (BY_ID.has(id)) set.add(id);
  return [...set];
}

/**
 * Coerce an untrusted loadout into a valid one for `characterClass`: every
 * referenced id must be a cosmetic of the right type and present in `owned`. A
 * skin must belong to this class. Unknown / unowned refs fall back to "none"
 * (the default title when owned).
 */
export function sanitizeLoadout(
  raw: unknown,
  owned: readonly string[],
  characterClass: CharacterClass,
): Loadout {
  const ownedSet = new Set(owned);
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<Loadout>;

  const skin = typeof obj.skinId === 'string' ? getCosmeticOfType(obj.skinId, 'skin') : undefined;
  const skinId = skin && ownedSet.has(skin.id) && skin.characterClass === characterClass ? skin.id : '';

  const rawEmotes = Array.isArray(obj.emotes) ? obj.emotes : [];
  const emotes = rawEmotes
    .filter((id): id is string => typeof id === 'string' && ownedSet.has(id) && !!getCosmeticOfType(id, 'emote'))
    .slice(0, MAX_EMOTE_SLOTS);

  const equipped = (id: unknown, type: CosmeticType): string =>
    typeof id === 'string' && ownedSet.has(id) && getCosmetic(id)?.type === type ? id : '';

  return {
    skinId,
    emotes: emotes.length ? emotes : [...DEFAULT_LOADOUT.emotes].filter((id) => ownedSet.has(id)),
    dyeId: equipped(obj.dyeId, 'dye'),
    pedestalId: equipped(obj.pedestalId, 'pedestal'),
    titleId: equipped(obj.titleId, 'title') || (ownedSet.has('title.novice') ? 'title.novice' : ''),
  };
}

/** Sanitize one character's wardrobe (owned set + equipped loadout). */
export function sanitizeClassCosmetics(raw: unknown, characterClass: CharacterClass): ClassCosmetics {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<ClassCosmetics>;
  const owned = sanitizeOwned(obj.owned);
  return { owned, loadout: sanitizeLoadout(obj.loadout, owned, characterClass) };
}

/** Sanitize a full per-class cosmetics state, keeping only known classes. */
export function sanitizeState(raw: unknown): CosmeticsState {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const state: CosmeticsState = {};
  for (const cls of CHARACTER_CLASSES) {
    if (obj[cls] != null) state[cls] = sanitizeClassCosmetics(obj[cls], cls);
  }
  return state;
}

/** The wardrobe for one class, falling back to defaults when untouched. */
export function classCosmeticsOf(state: CosmeticsState, characterClass: CharacterClass): ClassCosmetics {
  return state[characterClass] ?? defaultClassCosmetics();
}
