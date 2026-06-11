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
  // Rigged GLB (Meshy AI "Wasteland Road Warrior"). ~1.62u tall, feet at origin,
  // so no scale/offset. Idle/Walk/Run/Die clips were merged from the separate
  // Meshy exports (see scripts/merge-clips.mjs). It carries its own gear, so no
  // separate weapon mount.
  render: {
    kind: 'gltf',
    url: '/models/characters/warrior.glb',
    scale: 1,
    offset: [0, 0, 0],
    yaw: 0,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', die: 'Die' },
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
    scale: 1,
    offset: [0, 0, 0],
    yaw: 0,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run' },
  },
};

const archer: CharacterDescriptor = {
  id: 'char.archer',
  displayName: 'Archer',
  class: 'archer',
  // Rigged Mixamo GLB (~180u tall in cm → scale 0.01, feet at origin). It ships
  // with a single run clip ('mixamo.com'); the renderer plays it for every state
  // until idle/attack/death clips are added.
  render: {
    kind: 'gltf',
    url: '/models/characters/archer.glb',
    scale: 0.01,
    offset: [0, 0, 0],
    yaw: 0,
    clips: { run: 'mixamo.com' },
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
