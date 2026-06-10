import {
  CLASS_TO_ASSET,
  type CharacterClass,
  type CharacterDescriptor,
  type PlaceholderPart,
} from '@arena/shared';
import { assets } from './registry';

/**
 * A skin layers cosmetic overrides on top of a base character. Recolors are
 * keyed by part `name`; a full `render` swap (e.g. a GLTF skin) is also allowed.
 */
export interface SkinDefinition {
  id: string;
  baseId: CharacterDescriptor['id'];
  /** Part name → replacement color. */
  recolor?: Record<string, string>;
  /** Replace the entire render source (future GLTF skins). */
  render?: CharacterDescriptor['render'];
}

const skins = new Map<string, SkinDefinition>();

export function registerSkin(skin: SkinDefinition): void {
  skins.set(skin.id, skin);
}

/** Built-in example skin proving the override path end to end. */
registerSkin({
  id: 'skin.warrior.gold',
  baseId: 'char.warrior',
  recolor: { helmet: '#ffd86b', 'pauldron.l': '#ffd86b', 'pauldron.r': '#ffd86b' },
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
 * Gameplay code only knows class + optional skin id; this is the single place
 * that turns that into a concrete (possibly skin-modified) descriptor.
 */
export function resolveCharacter(
  characterClass: CharacterClass,
  skinId?: string,
): CharacterDescriptor {
  const base = assets.getCharacter(CLASS_TO_ASSET[characterClass]);

  if (!skinId) return base;
  const skin = skins.get(skinId);
  if (!skin) return base;

  let result = skin.render ? { ...base, render: skin.render } : base;
  if (skin.recolor) result = applyRecolor(result, skin.recolor);
  return result;
}
