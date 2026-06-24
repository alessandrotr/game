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

import {
  CHARACTER_CLASSES,
  type AnimationName,
  type CharacterClass,
  type WeaponAssetId,
} from './assets.js';

export type CosmeticType =
  | 'skin'
  | 'emote'
  | 'dye'
  | 'pedestal'
  | 'title'
  | 'rim'
  | 'weapon'
  | 'enchant';

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
  /**
   * Class level needed before this can be unlocked. Omit to use the per-rarity
   * default ({@link RARITY_UNLOCK_LEVEL}); set it to override one item. See
   * {@link requiredLevelFor}.
   */
  requiredLevel?: number;
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
  anim: AnimationName;
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

/** A flavor title shown under the player name. The `color` tints the title text
 *  on the nameplate (gray for the base title, brighter for rarer ones). */
export interface TitleCosmetic extends BaseCosmetic {
  type: 'title';
  text: string;
  color: string;
}

/** Visual treatment of an avatar rim — the client maps each to a frame renderer.
 *  `solid` is a single-color neon edge; `gradient` blends `color`→`color2`;
 *  `pulse` animates the glow; `prismatic` cycles a full spectrum. */
export type RimEffect = 'solid' | 'gradient' | 'pulse' | 'prismatic';

/** An avatar frame/border drawn around the character portrait (and around a
 *  player's avatar anywhere it appears in 2D UI). Purely a 2D UI cosmetic — it
 *  never touches the 3D scene. The branded, store-facing collectible. */
export interface RimCosmetic extends BaseCosmetic {
  type: 'rim';
  /** Primary edge / glow color. */
  color: string;
  /** Second color for gradient / animated edges. */
  color2?: string;
  /** Visual treatment (defaults to `solid`). */
  effect?: RimEffect;
}

/** The held weapon's silhouette. Class-bound; its `id` doubles as the client
 *  `WeaponDescriptor` id (same convention as skins), so `Player.weaponId` carries
 *  the cosmetic id directly with no mapping. Each class has one `default` base. */
export interface WeaponCosmetic extends BaseCosmetic {
  type: 'weapon';
  characterClass: CharacterClass;
  /** The weapon asset id to render (identical to `id`). */
  weaponId: WeaponAssetId;
}

/** Visual style of a weapon enchant — the client maps each to a GLSL injection
 *  driven by one shared time uniform (no extra draw calls; see `enchantMaterial`).
 *  Every effect is animated emissive + a fresnel rim ("glow" without bloom). */
export type EnchantEffect =
  | 'ember' // upward licking heat, warm flicker
  | 'frost' // slow shimmer + cool rim
  | 'arcane' // swirling energy bands
  | 'venom' // dripping toxic pulse
  | 'holy' // steady radiant rim + soft pulse
  | 'storm' // fast crackling arcs
  | 'void' // dark core, violet edge
  | 'astral' // dark deep-space orb + twinkling stars (legendary)
  | 'verdant' // branching emerald energy veins (legendary)
  | 'spectral'; // ghostly green wraithfire — rising wisps + spectral rim (legendary)

/** A purely-visual enchant applied to the equipped weapon's showpiece parts
 *  (blade / orb / head). Class-bound so the effect always fits the class. */
export interface EnchantCosmetic extends BaseCosmetic {
  type: 'enchant';
  characterClass: CharacterClass;
  effect: EnchantEffect;
  /** Primary energy color. */
  color: string;
  /** Secondary color for two-tone effects (rim / core gradients). */
  color2?: string;
}

export type Cosmetic =
  | SkinCosmetic
  | EmoteCosmetic
  | DyeCosmetic
  | PedestalCosmetic
  | TitleCosmetic
  | RimCosmetic
  | WeaponCosmetic
  | EnchantCosmetic;

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
  /** Avatar frame/border (2D UI). Always set — defaults to `rim.standard`. */
  rimId: string;
  /** Equipped weapon cosmetic id ('' = the class's default base weapon). */
  weaponId: string;
  /** Equipped weapon-enchant id ('' = no enchant). */
  enchantId: string;
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
    rarity: 'rare',
    requiredLevel: 10,
  },
  {
    id: 'emote.dance2',
    type: 'emote',
    anim: 'dance2',
    name: 'Groove',
    description: 'Loosen up between rounds.',
    rarity: 'rare',
    requiredLevel: 13,
  },
];

const PEDESTALS: PedestalCosmetic[] = [
  // Plain glowing runes (cheap, classic) — common band, staggered 2-5.
  { id: 'pedestal.gold', type: 'pedestal', effect: 'ring', color: '#e8b24a', name: 'Golden Rune', description: 'A warm gilded ring.', rarity: 'common', requiredLevel: 2 },
  { id: 'pedestal.crimson', type: 'pedestal', effect: 'ring', color: '#d6435a', name: 'Crimson Rune', description: 'A smoldering red circle.', rarity: 'common', requiredLevel: 3 },
  { id: 'pedestal.azure', type: 'pedestal', effect: 'ring', color: '#4a8bff', name: 'Azure Rune', description: 'A glacial blue circle.', rarity: 'common', requiredLevel: 4 },
  { id: 'pedestal.emerald', type: 'pedestal', effect: 'ring', color: '#3fb87a', name: 'Emerald Rune', description: 'A living green circle.', rarity: 'common', requiredLevel: 5 },
  // Animated, shader-driven showpieces — rare/epic/legendary bands.
  { id: 'pedestal.pulse', type: 'pedestal', effect: 'pulse', color: '#22e1ff', name: 'Pulse Core', description: 'Concentric energy waves ripple outward beneath you.', rarity: 'rare', requiredLevel: 11 },
  { id: 'pedestal.holo', type: 'pedestal', effect: 'holo', color: '#27e0c8', name: 'Hologrid', description: 'A flickering holographic deck of scanlines.', rarity: 'rare', requiredLevel: 14 },
  { id: 'pedestal.aurora', type: 'pedestal', effect: 'aurora', color: '#3fb87a', color2: '#4a8bff', name: 'Aurora Veil', description: 'Northern lights drift in a slow ribbon.', rarity: 'epic', requiredLevel: 18 },
  { id: 'pedestal.vortex', type: 'pedestal', effect: 'vortex', color: '#9a6cff', color2: '#ff4d8d', name: 'Singularity', description: 'A spiral of light winds into the core.', rarity: 'legendary', requiredLevel: 30 },
  { id: 'pedestal.prism', type: 'pedestal', effect: 'prism', color: '#ff4d8d', name: 'Prismatica', description: 'A rotating spectrum of pure, shifting color.', rarity: 'legendary', requiredLevel: 38 },
];

const TITLES: TitleCosmetic[] = [
  // Color rises with rarity: gray base → blue → purple → gold.
  { id: 'title.novice', type: 'title', text: 'Novice', color: '#9aa3b8', name: 'Novice', description: 'Everyone starts somewhere.', rarity: 'common', default: true },
  { id: 'title.gladiator', type: 'title', text: 'Gladiator', color: '#9aa3b8', name: 'Gladiator', description: 'Blooded in the arena.', rarity: 'common', requiredLevel: 4 },
  { id: 'title.champion', type: 'title', text: 'Champion', color: '#4a8bff', name: 'Champion', description: 'A proven victor.', rarity: 'rare', requiredLevel: 12 },
  { id: 'title.warlord', type: 'title', text: 'Warlord', color: '#9a6cff', name: 'Warlord', description: 'Feared across the field.', rarity: 'epic', requiredLevel: 22 },
  { id: 'title.legend', type: 'title', text: 'Legend', color: '#e8b24a', name: 'Legend', description: 'Spoken of in hushed tones.', rarity: 'legendary', requiredLevel: 40 },
];

const RIMS: RimCosmetic[] = [
  // Standard issue — the starter frame everyone owns (neutral steel edge).
  { id: 'rim.standard', type: 'rim', effect: 'solid', color: '#9aa3b8', name: 'Standard Issue', description: 'The frame every recruit ships with.', rarity: 'common', default: true },
  // Common band (2–5): single-color neon edges.
  { id: 'rim.cobalt', type: 'rim', effect: 'solid', color: '#4a8bff', name: 'Cobalt', description: 'A cold electric-blue edge.', rarity: 'common', requiredLevel: 3 },
  { id: 'rim.viper', type: 'rim', effect: 'solid', color: '#3fb87a', name: 'Viper', description: 'Toxic-green trim with a sharp glow.', rarity: 'common', requiredLevel: 5 },
  // Rare band (10–15): brighter, gradient edges.
  { id: 'rim.plasma', type: 'rim', effect: 'gradient', color: '#22e1ff', color2: '#4a8bff', name: 'Plasma', description: 'A charged cyan-to-blue gradient.', rarity: 'rare', requiredLevel: 11 },
  { id: 'rim.inferno', type: 'rim', effect: 'gradient', color: '#ffb43a', color2: '#ff3a3a', name: 'Inferno', description: 'Molten amber bleeding into red.', rarity: 'rare', requiredLevel: 14 },
  // Epic band (16–25): animated pulse + dual-tone.
  { id: 'rim.void', type: 'rim', effect: 'pulse', color: '#9a6cff', name: 'Void', description: 'A pulsing violet halo.', rarity: 'epic', requiredLevel: 18 },
  { id: 'rim.nebula', type: 'rim', effect: 'gradient', color: '#ff4d8d', color2: '#4a8bff', name: 'Nebula', description: 'Stardust pinks drift into deep blue.', rarity: 'epic', requiredLevel: 24 },
  // Legendary band (26–40): the showpieces.
  { id: 'rim.apex', type: 'rim', effect: 'pulse', color: '#e8b24a', color2: '#fff1c4', name: 'Apex', description: 'A breathing gold corona for the elite.', rarity: 'legendary', requiredLevel: 30 },
  { id: 'rim.prismatic', type: 'rim', effect: 'prismatic', color: '#ff4d8d', name: 'Prismatic', description: 'A rotating spectrum of pure, shifting light.', rarity: 'legendary', requiredLevel: 38 },
];

// Weapons — each class owns a `default` base (its id matches the character's
// grip weapon), then unlocks upgraded silhouettes. The id IS the client weapon
// asset id, so equipping one renders that descriptor (see assets/data/weapons).
const WEAPONS: WeaponCosmetic[] = [
  // Warrior — sword line.
  { id: 'weapon.sword', weaponId: 'weapon.sword', type: 'weapon', characterClass: 'warrior', name: 'Arming Sword', description: 'The blade every recruit is issued.', rarity: 'common', default: true },
  { id: 'weapon.warrior.greatblade', weaponId: 'weapon.warrior.greatblade', type: 'weapon', characterClass: 'warrior', name: 'Greatblade', description: 'A broad, fullered two-hander.', rarity: 'rare', requiredLevel: 12 },
  { id: 'weapon.warrior.runeblade', weaponId: 'weapon.warrior.runeblade', type: 'weapon', characterClass: 'warrior', name: 'Riftblade', description: 'A brutal cleaver greatsword with a hooked, spiked edge.', rarity: 'epic', requiredLevel: 20 },
  // Mage — staff line.
  { id: 'weapon.staff', weaponId: 'weapon.staff', type: 'weapon', characterClass: 'mage', name: 'Apprentice Staff', description: 'A simple focus topped with a gem.', rarity: 'common', default: true },
  { id: 'weapon.mage.archonstaff', weaponId: 'weapon.mage.archonstaff', type: 'weapon', characterClass: 'mage', name: 'Archon Staff', description: 'A clawed staff cradling a faceted core.', rarity: 'rare', requiredLevel: 12 },
  { id: 'weapon.mage.voidscepter', weaponId: 'weapon.mage.voidscepter', type: 'weapon', characterClass: 'mage', name: 'Void Staff', description: 'A halo-ringed staff around a dark star.', rarity: 'epic', requiredLevel: 20 },
  // Archer — bow line.
  { id: 'weapon.bow', weaponId: 'weapon.bow', type: 'weapon', characterClass: 'archer', name: 'Hunting Bow', description: 'A reliable recurve of seasoned wood.', rarity: 'common', default: true },
  { id: 'weapon.archer.recurve', weaponId: 'weapon.archer.recurve', type: 'weapon', characterClass: 'archer', name: 'War Recurve', description: 'A reinforced limb with bladed tips.', rarity: 'rare', requiredLevel: 12 },
  { id: 'weapon.archer.dawnbow', weaponId: 'weapon.archer.dawnbow', type: 'weapon', characterClass: 'archer', name: 'Dawnbow', description: 'A sweeping longbow lit at the nocks.', rarity: 'epic', requiredLevel: 20 },
  // Priest — mace line.
  { id: 'weapon.mace', weaponId: 'weapon.mace', type: 'weapon', characterClass: 'priest', name: 'Acolyte Mace', description: 'A blessed cudgel of plain gold.', rarity: 'common', default: true },
  { id: 'weapon.priest.flanged', weaponId: 'weapon.priest.flanged', type: 'weapon', characterClass: 'priest', name: 'Flanged Mace', description: 'A heavy head of radiant flanges.', rarity: 'rare', requiredLevel: 12 },
  { id: 'weapon.priest.censer', weaponId: 'weapon.priest.censer', type: 'weapon', characterClass: 'priest', name: 'Sun Censer', description: 'A haloed orb-head crowned in gold.', rarity: 'epic', requiredLevel: 20 },
];

// Enchants — animated shader FX on the equipped weapon. Class-bound and themed,
// staggered across the rarity bands. The `effect` selects the GLSL injection.
const ENCHANTS: EnchantCosmetic[] = [
  // Warrior — four distinct effects, four distinct colors.
  { id: 'enchant.warrior.ember', type: 'enchant', characterClass: 'warrior', effect: 'ember', color: '#ff4d1a', color2: '#ffb020', name: 'Embered', description: 'Heat licks up the steel.', rarity: 'common', requiredLevel: 3 },
  { id: 'enchant.warrior.tempest', type: 'enchant', characterClass: 'warrior', effect: 'storm', color: '#2f6bff', color2: '#cfe3ff', name: 'Tempest', description: 'Lightning crackles along the edge.', rarity: 'rare', requiredLevel: 12 },
  { id: 'enchant.warrior.dread', type: 'enchant', characterClass: 'warrior', effect: 'void', color: '#8a1aff', color2: '#1a0030', name: 'Dreadbound', description: 'A hungry dark clings to the blade.', rarity: 'epic', requiredLevel: 20 },
  { id: 'enchant.warrior.sunforge', type: 'enchant', characterClass: 'warrior', effect: 'spectral', color: '#1affa0', color2: '#c6ff5a', name: 'Wraithfire', description: 'Spectral green fire wreathes the steel.', rarity: 'legendary', requiredLevel: 32 },
  // Mage — four distinct effects, four distinct colors.
  { id: 'enchant.mage.arcane', type: 'enchant', characterClass: 'mage', effect: 'arcane', color: '#c43cff', color2: '#4a7bff', name: 'Arcane', description: 'Energy swirls around the focus.', rarity: 'common', requiredLevel: 3 },
  { id: 'enchant.mage.frost', type: 'enchant', characterClass: 'mage', effect: 'frost', color: '#00c8ff', color2: '#eafcff', name: 'Frostbound', description: 'A glacial shimmer rimes the gem.', rarity: 'rare', requiredLevel: 13 },
  { id: 'enchant.mage.void', type: 'enchant', characterClass: 'mage', effect: 'void', color: '#ff2a48', color2: '#1a0006', name: 'Voidtouched', description: 'The core drinks the light.', rarity: 'epic', requiredLevel: 21 },
  { id: 'enchant.mage.astral', type: 'enchant', characterClass: 'mage', effect: 'astral', color: '#ffc24a', color2: '#ffe9a8', name: 'Astral', description: 'A black void of deep space, alive with stars.', rarity: 'legendary', requiredLevel: 34 },
  // Archer — four distinct effects, four distinct colors.
  { id: 'enchant.archer.venom', type: 'enchant', characterClass: 'archer', effect: 'venom', color: '#9bff1a', color2: '#2a6a00', name: 'Envenomed', description: 'Toxin beads along the limb.', rarity: 'common', requiredLevel: 4 },
  { id: 'enchant.archer.gale', type: 'enchant', characterClass: 'archer', effect: 'storm', color: '#5fffd8', color2: '#ffffff', name: 'Galeforce', description: 'A sharp wind sings off the string.', rarity: 'rare', requiredLevel: 13 },
  { id: 'enchant.archer.frostbite', type: 'enchant', characterClass: 'archer', effect: 'frost', color: '#c8d8ff', color2: '#ffffff', name: 'Frostbite', description: 'A cold haze clings to every shot.', rarity: 'epic', requiredLevel: 22 },
  { id: 'enchant.archer.plague', type: 'enchant', characterClass: 'archer', effect: 'void', color: '#3bd610', color2: '#08220a', name: 'Plaguebearer', description: 'A roiling green corruption.', rarity: 'legendary', requiredLevel: 34 },
  // Priest — four distinct effects, four distinct colors.
  { id: 'enchant.priest.blessed', type: 'enchant', characterClass: 'priest', effect: 'holy', color: '#ffd633', color2: '#fff2c0', name: 'Blessed', description: 'A warm, steady radiance.', rarity: 'common', requiredLevel: 4 },
  { id: 'enchant.priest.sanctified', type: 'enchant', characterClass: 'priest', effect: 'ember', color: '#ff7a3a', color2: '#ffd24a', name: 'Sanctified', description: 'Sacred flame wreathes the head.', rarity: 'rare', requiredLevel: 14 },
  { id: 'enchant.priest.divinity', type: 'enchant', characterClass: 'priest', effect: 'arcane', color: '#9b6aff', color2: '#ffd86b', name: 'Divinity', description: 'Glowing sigils orbit the mace.', rarity: 'epic', requiredLevel: 22 },
  { id: 'enchant.priest.celestial', type: 'enchant', characterClass: 'priest', effect: 'verdant', color: '#1fff7a', color2: '#c8ff4a', name: 'Verdant', description: 'Surging emerald life-force veins the head.', rarity: 'legendary', requiredLevel: 36 },
];

/** The full cosmetics catalog, in display order within each type. */
export const COSMETICS: readonly Cosmetic[] = [
  ...EMOTES,
  ...PEDESTALS,
  ...TITLES,
  ...RIMS,
  ...WEAPONS,
  ...ENCHANTS,
];

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

// ---------------------------------------------------------------------------
// Unlock progression
//
// MAINTENANCE: this is the whole pacing dial. Each rarity owns a LEVEL BAND, and
// every item picks an explicit `requiredLevel` *within its band* so items of the
// same rarity stagger (they don't all unlock at once). `RARITY_LEVEL_RANGE` is
// the band; `RARITY_UNLOCK_LEVEL` is only the fallback for an item that omits
// `requiredLevel` (the band's floor). Changing an item's `rarity` moves both its
// accent color and its band. The dev guardrail below flags any item whose level
// falls outside its band.
// ---------------------------------------------------------------------------

/** The allowed unlock-level band per rarity `[min, max]` — items pick a level
 *  inside their band. Widen/shift a band to re-pace a whole tier. */
export const RARITY_LEVEL_RANGE: Record<CosmeticRarity, readonly [number, number]> = {
  common: [2, 5],
  rare: [10, 15],
  epic: [16, 25],
  legendary: [26, 40],
};

/** Fallback unlock level for an item that omits `requiredLevel`: its band floor.
 *  Prefer an explicit per-item `requiredLevel` so same-rarity items stagger. */
export const RARITY_UNLOCK_LEVEL: Record<CosmeticRarity, number> = {
  common: RARITY_LEVEL_RANGE.common[0],
  rare: RARITY_LEVEL_RANGE.rare[0],
  epic: RARITY_LEVEL_RANGE.epic[0],
  legendary: RARITY_LEVEL_RANGE.legendary[0],
};

/** The class level an item needs before it can be claimed. Default/starter items
 *  are always level 1; otherwise an explicit `requiredLevel`, else the band floor. */
export function requiredLevelFor(c: Cosmetic): number {
  if (c.default) return 1;
  return c.requiredLevel ?? RARITY_UNLOCK_LEVEL[c.rarity];
}

/** Whether an item's `requiredLevel` sits inside its rarity band — the catalog
 *  invariant. Returns true for default/starter items and items with no explicit
 *  level. Drives the maintenance test that guards against a mis-tuned edit. */
export function isWithinRarityBand(c: Cosmetic): boolean {
  if (c.default || c.requiredLevel === undefined) return true;
  const [min, max] = RARITY_LEVEL_RANGE[c.rarity];
  return c.requiredLevel >= min && c.requiredLevel <= max;
}

/** Whether a class at `level` has reached an item's unlock requirement. */
export function isUnlocked(c: Cosmetic, level: number): boolean {
  return level >= requiredLevelFor(c);
}

/**
 * How many catalog items this class can claim **right now** but hasn't yet: the
 * level requirement is met and they're not already owned. Drives the store's
 * "you have unlockables" notification badge. Skins are class-bound (only this
 * class's count); other types apply to every class.
 */
export function claimableCount(
  owned: readonly string[],
  characterClass: CharacterClass,
  level: number,
): number {
  const set = new Set(owned);
  let n = 0;
  for (const c of COSMETICS) {
    if (set.has(c.id)) continue;
    // Class-bound types only count toward their own class.
    if ((c.type === 'skin' || c.type === 'weapon' || c.type === 'enchant') && c.characterClass !== characterClass) continue;
    if (isUnlocked(c, level)) n++;
  }
  return n;
}

/** Ids every character owns from the start (the `default` items). */
export const DEFAULT_OWNED: readonly string[] = COSMETICS.filter((c) => c.default).map((c) => c.id);

/** A fresh character's loadout: default title, base look. Emotes unlock with
 *  level (none are starter items), so a new character binds none. */
export const DEFAULT_LOADOUT: Loadout = {
  skinId: '',
  emotes: EMOTES.filter((e) => e.default).map((e) => e.id),
  dyeId: '',
  pedestalId: '',
  titleId: 'title.novice',
  rimId: 'rim.standard',
  // '' = the class's default base weapon (resolved client-side), no enchant.
  weaponId: '',
  enchantId: '',
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
 * the defaults. When `level` is given (server-side, the class's level), items
 * above their unlock requirement are dropped — so a client can't claim early.
 * Used on both sides of the wire.
 */
export function sanitizeOwned(raw: unknown, level?: number): string[] {
  const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  const set = new Set<string>(DEFAULT_OWNED);
  for (const id of ids) {
    const c = BY_ID.get(id);
    if (!c) continue;
    if (level !== undefined && !isUnlocked(c, level)) continue; // not yet unlocked
    set.add(id);
  }
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

  // Weapon & enchant are class-bound like skins: must be owned and match the class.
  const weapon = typeof obj.weaponId === 'string' ? getCosmeticOfType(obj.weaponId, 'weapon') : undefined;
  const weaponId = weapon && ownedSet.has(weapon.id) && weapon.characterClass === characterClass ? weapon.id : '';

  const enchant = typeof obj.enchantId === 'string' ? getCosmeticOfType(obj.enchantId, 'enchant') : undefined;
  const enchantId = enchant && ownedSet.has(enchant.id) && enchant.characterClass === characterClass ? enchant.id : '';

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
    rimId: equipped(obj.rimId, 'rim') || (ownedSet.has('rim.standard') ? 'rim.standard' : ''),
    weaponId,
    enchantId,
  };
}

/** Sanitize one character's wardrobe (owned set + equipped loadout). Pass the
 *  class's `level` (server-side) to enforce unlock requirements. */
export function sanitizeClassCosmetics(
  raw: unknown,
  characterClass: CharacterClass,
  level?: number,
): ClassCosmetics {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<ClassCosmetics>;
  const owned = sanitizeOwned(obj.owned, level);
  return { owned, loadout: sanitizeLoadout(obj.loadout, owned, characterClass) };
}

/** Sanitize a full per-class cosmetics state, keeping only known classes. Pass
 *  per-class `levels` (server-side) to enforce unlock requirements. */
export function sanitizeState(
  raw: unknown,
  levels?: Partial<Record<CharacterClass, number>>,
): CosmeticsState {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const state: CosmeticsState = {};
  for (const cls of CHARACTER_CLASSES) {
    if (obj[cls] != null) state[cls] = sanitizeClassCosmetics(obj[cls], cls, levels?.[cls]);
  }
  return state;
}

/** The wardrobe for one class, falling back to defaults when untouched. */
export function classCosmeticsOf(state: CosmeticsState, characterClass: CharacterClass): ClassCosmetics {
  return state[characterClass] ?? defaultClassCosmetics();
}
