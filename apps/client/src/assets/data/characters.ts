import type { CharacterDescriptor } from '@arena/shared';

const SKIN = '#e6b98f';
const STEEL = '#9aa3b2';

/**
 * Placeholder characters built entirely from primitives. Each silhouette is
 * deliberately distinct so classes read at a glance. Local space has the origin
 * at the feet (y = 0 is the ground); weapons attach via the referenced weapon's
 * grip transform.
 */

const warrior: CharacterDescriptor = {
  id: 'char.warrior',
  displayName: 'Warrior',
  class: 'warrior',
  weaponId: 'weapon.sword',
  animations: { idle: 'anim.idle', walk: 'anim.walk', attack: 'anim.attack' },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'body',
        shape: 'capsule',
        args: [0.4, 0.7, 8, 16],
        position: [0, 0.75, 0],
        color: '#b94b4b',
        roughness: 0.6,
      },
      { name: 'head', shape: 'sphere', args: [0.28, 16, 16], position: [0, 1.45, 0], color: SKIN },
      {
        name: 'helmet',
        shape: 'box',
        args: [0.62, 0.22, 0.62],
        position: [0, 1.6, 0],
        color: STEEL,
        metalness: 0.6,
        roughness: 0.4,
      },
      {
        name: 'pauldron.l',
        shape: 'box',
        args: [0.26, 0.18, 0.44],
        position: [0.42, 1.12, 0],
        color: STEEL,
        metalness: 0.6,
        roughness: 0.4,
      },
      {
        name: 'pauldron.r',
        shape: 'box',
        args: [0.26, 0.18, 0.44],
        position: [-0.42, 1.12, 0],
        color: STEEL,
        metalness: 0.6,
        roughness: 0.4,
      },
    ],
  },
};

const mage: CharacterDescriptor = {
  id: 'char.mage',
  displayName: 'Mage',
  class: 'mage',
  // GLB drop-in. The model is centered at the origin (~2u tall), so `offset`
  // lifts its feet to the ground after `scale`. It ships with no rig/clips, so
  // the renderer drives a procedural idle/cast/death fallback. Add a `clips`
  // map here if a rigged version with named animations is dropped in later.
  render: {
    kind: 'gltf',
    url: '/models/characters/mage.glb',
    scale: 0.9,
    offset: [0, 0.9, 0],
    yaw: 0,
  },
};

const archer: CharacterDescriptor = {
  id: 'char.archer',
  displayName: 'Archer',
  class: 'archer',
  weaponId: 'weapon.bow',
  animations: { idle: 'anim.idle', walk: 'anim.walk', attack: 'anim.attack' },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'body',
        shape: 'capsule',
        args: [0.32, 0.72, 8, 16],
        position: [0, 0.72, 0],
        color: '#3f9d56',
        roughness: 0.7,
      },
      { name: 'head', shape: 'sphere', args: [0.25, 16, 16], position: [0, 1.38, 0], color: SKIN },
      {
        name: 'hood',
        shape: 'cone',
        args: [0.32, 0.36, 16],
        position: [0, 1.56, 0],
        color: '#2c6e3d',
        roughness: 0.9,
      },
      {
        name: 'quiver',
        shape: 'cylinder',
        args: [0.08, 0.08, 0.5, 12],
        position: [-0.3, 1.05, -0.22],
        rotation: [0.35, 0, 0.3],
        color: '#6b4a2a',
      },
    ],
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
    parts: [
      {
        name: 'body',
        shape: 'capsule',
        args: [0.36, 0.7, 8, 16],
        position: [0, 0.74, 0],
        color: '#e8e3d0',
        roughness: 0.8,
      },
      { name: 'head', shape: 'sphere', args: [0.26, 16, 16], position: [0, 1.42, 0], color: SKIN },
      {
        name: 'halo',
        shape: 'torus',
        args: [0.28, 0.05, 12, 28],
        position: [0, 1.82, 0],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ffd86b',
        emissive: '#ffcf4d',
        emissiveIntensity: 1.2,
      },
    ],
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
    parts: [
      {
        name: 'body',
        shape: 'capsule',
        args: [0.38, 0.72, 8, 16],
        position: [0, 0.74, 0],
        color: '#54607a',
        roughness: 0.6,
      },
      { name: 'head', shape: 'sphere', args: [0.27, 16, 16], position: [0, 1.44, 0], color: SKIN },
      {
        name: 'helmet',
        shape: 'cone',
        args: [0.3, 0.4, 12],
        position: [0, 1.66, 0],
        color: STEEL,
        metalness: 0.6,
      },
    ],
  },
};

const merchant: CharacterDescriptor = {
  id: 'char.npc.merchant',
  displayName: 'Merchant',
  animations: { idle: 'anim.idle' },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'body',
        shape: 'capsule',
        args: [0.4, 0.7, 8, 16],
        position: [0, 0.72, 0],
        color: '#8a5a2b',
        roughness: 0.8,
      },
      { name: 'head', shape: 'sphere', args: [0.27, 16, 16], position: [0, 1.4, 0], color: SKIN },
      {
        name: 'pack',
        shape: 'box',
        args: [0.5, 0.5, 0.3],
        position: [0, 0.95, -0.4],
        color: '#5a3b22',
      },
    ],
  },
};

export const CHARACTERS: CharacterDescriptor[] = [warrior, mage, archer, priest, guard, merchant];
