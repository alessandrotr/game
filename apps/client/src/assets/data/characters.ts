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
  animations: { idle: 'anim.idle', walk: 'anim.walk', cast: 'anim.attack' },
  // Placeholder built from primitives (same style as the priest): a steel-armored
  // capsule body, a skin-toned head, and a conical helmet so the silhouette reads
  // as a heavy melee fighter at a glance. Sword attaches via weapon.sword's grip.
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'body',
        shape: 'capsule',
        args: [0.4, 0.72, 8, 16],
        position: [0, 0.74, 0],
        color: STEEL,
        metalness: 0.5,
        roughness: 0.5,
      },
      { name: 'head', shape: 'sphere', args: [0.26, 16, 16], position: [0, 1.44, 0], color: SKIN },
      {
        name: 'helmet',
        shape: 'cone',
        args: [0.3, 0.42, 12],
        position: [0, 1.68, 0],
        color: '#c0392b',
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
  // Rigged GLB (Meshy AI). ~1.7u tall with feet at the origin, so it needs no
  // scale/offset. Idle/Walk/Run clips were merged from three single-clip Meshy
  // exports (see scripts/merge-clips.mjs) onto one shared skeleton.
  render: {
    kind: 'gltf',
    url: '/models/characters/mage.glb',
    scale: 1.35,
    offset: [0, 0, 0],
    yaw: 0,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run' },
  },
};

const archer: CharacterDescriptor = {
  id: 'char.archer',
  displayName: 'Archer',
  class: 'archer',
  // Rigged GLB (Meshy AI). ~1.66u-tall skeleton; scaled to match the warrior's
  // on-screen height. Idle/Walk/Run/Die + two dances were merged from the
  // separate single-clip Meshy exports (see scripts/merge-clips.mjs) onto one
  // shared skeleton.
  render: {
    kind: 'gltf',
    url: '/models/characters/archer.glb',
    scale: 1.29,
    offset: [0, 0, 0],
    yaw: 0,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      die: 'Die',
      dance1: 'Dance1',
      dance2: 'Dance2',
    },
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
