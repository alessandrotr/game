import type { CharacterDescriptor, PlaceholderPart } from '@arena/shared';
import { humanoid, BODY_BASE_COLOR, type HumanoidPalette } from './humanoid';

/**
 * Characters. Every figure shares the EXACT same humanoid body (see
 * `humanoid()` — legs, feet, torso, arms, hands, head, eyes); classes differ
 * only by palette (dyes) and the headgear / accessory slots layered on top.
 * Local space has the origin at the feet (y = 0 is the ground); weapons attach
 * via the referenced weapon's grip transform, which lands in the right hand.
 *
 * The slot inputs (palette / headgear / accessories / main hand) are the same
 * data the planned unlock store will drive — a cosmetic is just a value for a
 * slot, so equipping one later means swapping the input here, nothing more.
 */

// --- headgear / accessory parts (the per-class slot contents) ---

const coneHelmet = (color: string, metal: string): PlaceholderPart[] => [
  { name: 'helmet', shape: 'cone', args: [0.29, 0.44, 16], position: [0, 1.82, 0], color, metalness: 0.6, roughness: 0.4 },
  { name: 'helmet.crest', shape: 'box', args: [0.06, 0.16, 0.36], position: [0, 1.98, 0], color: metal, roughness: 0.4 },
];

const shoulderPads = (color: string): PlaceholderPart[] => [
  { name: 'pad.l', shape: 'sphere', args: [0.17, 12, 12], position: [-0.36, 1.24, 0.02], color, metalness: 0.5, roughness: 0.5 },
  { name: 'pad.r', shape: 'sphere', args: [0.17, 12, 12], position: [0.36, 1.24, 0.02], color, metalness: 0.5, roughness: 0.5 },
];

const wizardHat: PlaceholderPart[] = [
  { name: 'hat.brim', shape: 'cylinder', args: [0.35, 0.35, 0.05, 20], position: [0, 1.7, 0], color: '#2a3499', roughness: 0.7 },
  { name: 'hat.cone', shape: 'cone', args: [0.27, 0.68, 18], position: [0, 2.0, 0], color: '#3b4cca', roughness: 0.7 },
];

const hood: PlaceholderPart[] = [
  { name: 'hood', shape: 'cone', args: [0.33, 0.38, 14], position: [0, 1.76, -0.03], rotation: [-0.18, 0, 0], color: '#2f5e3b', roughness: 0.85 },
];

const quiver: PlaceholderPart[] = [
  { name: 'quiver', shape: 'cylinder', args: [0.07, 0.07, 0.5, 10], position: [-0.18, 1.0, -0.32], rotation: [0.35, 0, -0.3], color: '#5a3b22', roughness: 0.8 },
];

const halo: PlaceholderPart[] = [
  {
    name: 'halo',
    shape: 'torus',
    args: [0.29, 0.05, 12, 28],
    position: [0, 1.9, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: '#ffd86b',
    emissive: '#ffcf4d',
    emissiveIntensity: 1.2,
  },
];

const backpack: PlaceholderPart[] = [
  { name: 'pack', shape: 'box', args: [0.44, 0.48, 0.26], position: [0, 1.0, -0.38], color: '#5a3b22', roughness: 0.85 },
];

// --- palettes (the dye slot) ---
// Every class shares the SAME body/head color — a neutral blank canvas the
// player paints on. Only the class items (secondary/metal) differ per class.
const BASE = BODY_BASE_COLOR;

const PAL = {
  warrior: { primary: BASE, secondary: '#586074', metal: '#c0392b' } satisfies HumanoidPalette,
  mage: { primary: BASE, secondary: '#2a3499', metal: '#cdb24a' } satisfies HumanoidPalette,
  archer: { primary: BASE, secondary: '#2f5e3b', metal: '#7a5a30' } satisfies HumanoidPalette,
  priest: { primary: BASE, secondary: '#cfc6a8', metal: '#ffd86b' } satisfies HumanoidPalette,
  guard: { primary: BASE, secondary: '#3c465c', metal: '#9aa3b2' } satisfies HumanoidPalette,
  merchant: { primary: BASE, secondary: '#5a3b22', metal: '#caa472' } satisfies HumanoidPalette,
} as const;

const warrior: CharacterDescriptor = {
  id: 'char.warrior',
  displayName: 'Warrior',
  class: 'warrior',
  weaponId: 'weapon.sword',
  animations: { idle: 'anim.idle', walk: 'anim.walk', cast: 'anim.attack' },
  render: {
    kind: 'placeholder',
    parts: humanoid({
      palette: PAL.warrior,
      accessories: shoulderPads(PAL.warrior.primary),
      headgear: coneHelmet(PAL.warrior.primary, PAL.warrior.metal!),
    }),
  },
};

const mage: CharacterDescriptor = {
  id: 'char.mage',
  displayName: 'Mage',
  class: 'mage',
  weaponId: 'weapon.staff',
  animations: { idle: 'anim.idle', walk: 'anim.walk', cast: 'anim.cast' },
  render: {
    kind: 'placeholder',
    parts: humanoid({ palette: PAL.mage, headgear: wizardHat }),
  },
};

const archer: CharacterDescriptor = {
  id: 'char.archer',
  displayName: 'Archer',
  class: 'archer',
  weaponId: 'weapon.bow',
  animations: { idle: 'anim.idle', walk: 'anim.walk', cast: 'anim.attack' },
  render: {
    kind: 'placeholder',
    parts: humanoid({ palette: PAL.archer, headgear: hood, accessories: quiver }),
  },
};

const priest: CharacterDescriptor = {
  id: 'char.priest',
  displayName: 'Priest',
  class: 'priest',
  weaponId: 'weapon.mace',
  animations: { idle: 'anim.idle', walk: 'anim.walk', cast: 'anim.cast' },
  render: {
    kind: 'placeholder',
    parts: humanoid({ palette: PAL.priest, accessories: halo }),
  },
};

// --- NPCs: characters with no playable class, referenced directly by id. ---

const guard: CharacterDescriptor = {
  id: 'char.npc.guard',
  displayName: 'Town Guard',
  weaponId: 'weapon.staff',
  animations: { idle: 'anim.idle' },
  render: {
    kind: 'placeholder',
    parts: humanoid({ palette: PAL.guard, headgear: coneHelmet(PAL.guard.metal!, PAL.guard.secondary) }),
  },
};

const merchant: CharacterDescriptor = {
  id: 'char.npc.merchant',
  displayName: 'Merchant',
  animations: { idle: 'anim.idle' },
  render: {
    kind: 'placeholder',
    parts: humanoid({ palette: PAL.merchant, accessories: backpack }),
  },
};

export const CHARACTERS: CharacterDescriptor[] = [warrior, mage, archer, priest, guard, merchant];
