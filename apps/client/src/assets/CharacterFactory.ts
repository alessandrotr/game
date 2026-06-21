import {
  CLASS_TO_ASSET,
  ZOMBIE_SKIN_ID,
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_FAT_SKIN_ID,
  ZOMBIE_MINIBOSS_SKIN_ID,
  getCosmeticOfType,
  type CharacterClass,
  type CharacterDescriptor,
  type PlaceholderPart,
} from '@arena/shared';
import type { EnchantParams } from '../render/enchantMaterial';
import { assets } from './registry';
import { zombieBody } from './data/zombies';

/**
 * A skin layers cosmetic overrides on top of a base character. Recolors are
 * keyed by part `name`; a body `tint` (visible on rigged GLB models too) and a
 * full `render` swap (e.g. a GLTF skin) are also allowed.
 */
export interface SkinDefinition {
  id: string;
  baseId: CharacterDescriptor['id'];
  /** Part name → replacement color (placeholder bodies). */
  recolor?: Record<string, string>;
  /** Body tint multiplied into the materials (rigged + placeholder). */
  tint?: string;
  /** Replace the entire render source (future GLTF skins). */
  render?: CharacterDescriptor['render'];
  /** Drop the base character's grip weapon (e.g. zombies don't wield the
   *  warrior's sword — they claw). */
  hideWeapon?: boolean;
}

const skins = new Map<string, SkinDefinition>();

export function registerSkin(skin: SkinDefinition): void {
  skins.set(skin.id, skin);
}

/** GLTF render urls of every registered skin (the zombie/sprinter/fat bodies) —
 *  for front-running their downloads so the first spawn doesn't hitch. */
export function gltfSkinUrls(): string[] {
  const urls: string[] = [];
  for (const s of skins.values()) if (s.render?.kind === 'gltf') urls.push(s.render.url);
  return urls;
}

/** Built-in example skin proving the override path end to end. (No skins ship in
 *  the store yet — they'll be added gradually; this keeps the path exercised.) */
registerSkin({
  id: 'skin.warrior.gold',
  baseId: 'char.warrior',
  recolor: { helmet: '#ffd86b', 'pauldron.l': '#ffd86b', 'pauldron.r': '#ffd86b' },
});

/**
 * Zombie skins swap the whole body for a stylized PRIMITIVE figure (see
 * `data/zombies.ts`) — the same zero-cost placeholder path the players use, so a
 * full horde carries no skeleton/skinning/animation-mixer cost. Procedural motion
 * (idle bob / run lurch / attack lunge) is driven by `useProceduralAnimator`.
 * Each variant differs by body shape, color, eye glow, and hunch.
 */
registerSkin({
  id: ZOMBIE_SKIN_ID,
  baseId: 'char.warrior',
  render: { kind: 'placeholder', parts: zombieBody('standard') },
  hideWeapon: true,
});

/** Sprinter: lean, fast, red-eyed. {@link ZOMBIE_SPRINTER_SKIN_ID}. */
registerSkin({
  id: ZOMBIE_SPRINTER_SKIN_ID,
  baseId: 'char.warrior',
  render: { kind: 'placeholder', parts: zombieBody('sprinter') },
  hideWeapon: true,
});

/** Fat: bloated, high-health tank. {@link ZOMBIE_FAT_SKIN_ID}. */
registerSkin({
  id: ZOMBIE_FAT_SKIN_ID,
  baseId: 'char.warrior',
  render: { kind: 'placeholder', parts: zombieBody('fat') },
  hideWeapon: true,
});

/** Mini-Boss: a darker rot, rendered 2.5× oversized via the placeholder scale.
 *  {@link ZOMBIE_MINIBOSS_SKIN_ID}. */
registerSkin({
  id: ZOMBIE_MINIBOSS_SKIN_ID,
  baseId: 'char.warrior',
  render: { kind: 'placeholder', parts: zombieBody('miniboss'), scale: 2.5 },
  hideWeapon: true,
});

function applyRecolor(
  descriptor: CharacterDescriptor,
  recolor: Record<string, string>,
): CharacterDescriptor {
  if (descriptor.render.kind !== 'placeholder') return descriptor;
  const parts: PlaceholderPart[] = descriptor.render.parts.map((part) =>
    part.name && recolor[part.name] ? { ...part, color: recolor[part.name] as string } : part,
  );
  return { ...descriptor, render: { kind: 'placeholder', parts } };
}

/**
 * Resolve the character a player should render from their replicated state.
 * Gameplay code only knows class + optional skin/dye ids; this is the single
 * place that turns that into a concrete (skin- and dye-modified) descriptor.
 * A dye is applied on top of the skin (its tint/recolor wins).
 */
export function resolveCharacter(
  characterClass: CharacterClass,
  skinId?: string,
  dyeId?: string,
  weaponId?: string,
): CharacterDescriptor {
  let result = assets.getCharacter(CLASS_TO_ASSET[characterClass]);

  const skin = skinId ? skins.get(skinId) : undefined;
  if (skin) {
    if (skin.render) result = { ...result, render: skin.render };
    if (skin.tint) result = { ...result, tint: skin.tint };
    if (skin.recolor) result = applyRecolor(result, skin.recolor);
    if (skin.hideWeapon) result = { ...result, weaponId: undefined };
  }

  const dye = dyeId ? getCosmeticOfType(dyeId, 'dye') : undefined;
  if (dye) {
    result = { ...result, tint: dye.color };
    if (dye.recolor) result = applyRecolor(result, dye.recolor);
  }

  // Equipped weapon cosmetic overrides the class's base grip weapon (class-bound;
  // an invalid / wrong-class id leaves the base weapon in place). '' = base.
  const weapon = weaponId ? getCosmeticOfType(weaponId, 'weapon') : undefined;
  if (weapon && weapon.characterClass === characterClass) {
    result = { ...result, weaponId: weapon.weaponId };
  }

  return result;
}

/** Resolve an equipped enchant id into the params the renderer needs, or
 *  undefined for no enchant. Class binding is enforced server-side; here we only
 *  need the visual fields. */
export function resolveEnchant(enchantId?: string): EnchantParams | undefined {
  const e = enchantId ? getCosmeticOfType(enchantId, 'enchant') : undefined;
  return e ? { effect: e.effect, color: e.color, color2: e.color2 } : undefined;
}
