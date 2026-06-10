import type { VfxDescriptor } from '@arena/shared';

/** Ability effects built from emissive primitives. Behavior drives animation. */

const fireball: VfxDescriptor = {
  id: 'vfx.fireball',
  displayName: 'Fireball',
  behavior: 'projectile',
  speed: 18,
  durationMs: 2000,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'core',
        shape: 'sphere',
        args: [0.18, 16, 16],
        color: '#fff1c2',
        emissive: '#ffd24a',
        emissiveIntensity: 3,
      },
      {
        name: 'flame',
        shape: 'sphere',
        args: [0.32, 16, 16],
        color: '#ff7b2e',
        emissive: '#ff5500',
        emissiveIntensity: 2.2,
        opacity: 0.6,
      },
    ],
  },
};

const arrow: VfxDescriptor = {
  id: 'vfx.arrow',
  displayName: 'Arrow',
  behavior: 'projectile',
  speed: 32,
  durationMs: 1500,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'shaft',
        shape: 'cylinder',
        args: [0.02, 0.02, 0.7, 6],
        rotation: [Math.PI / 2, 0, 0],
        color: '#cdbb99',
      },
      {
        name: 'tip',
        shape: 'cone',
        args: [0.05, 0.14, 8],
        position: [0, 0, 0.42],
        rotation: [Math.PI / 2, 0, 0],
        color: '#8a8f9c',
        metalness: 0.6,
      },
    ],
  },
};

const heal: VfxDescriptor = {
  id: 'vfx.heal',
  displayName: 'Heal',
  behavior: 'burst',
  durationMs: 900,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [0.6, 0.06, 12, 32],
        rotation: [Math.PI / 2, 0, 0],
        color: '#7cff9e',
        emissive: '#39ff88',
        emissiveIntensity: 2.2,
      },
    ],
  },
};

const cast: VfxDescriptor = {
  id: 'vfx.cast',
  displayName: 'Cast Flash',
  behavior: 'burst',
  durationMs: 450,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'flash',
        shape: 'sphere',
        args: [0.25, 12, 12],
        color: '#cfe6ff',
        emissive: '#8ec5ff',
        emissiveIntensity: 2.5,
        opacity: 0.8,
      },
    ],
  },
};

const portal: VfxDescriptor = {
  id: 'vfx.portal',
  displayName: 'Arena Portal',
  behavior: 'static',
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [1.1, 0.18, 16, 40],
        position: [0, 1.3, 0],
        color: '#1c9bd6',
        emissive: '#22c8ff',
        emissiveIntensity: 1.8,
      },
      {
        name: 'surface',
        shape: 'sphere',
        args: [0.95, 24, 24],
        position: [0, 1.3, 0],
        scale: [1, 1, 0.12],
        color: '#0a3a55',
        emissive: '#1880c0',
        emissiveIntensity: 1.2,
        opacity: 0.75,
      },
    ],
  },
};

const frost: VfxDescriptor = {
  id: 'vfx.frost',
  displayName: 'Frost Nova',
  behavior: 'burst',
  durationMs: 600,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [1.0, 0.12, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#bfefff',
        emissive: '#5fd8ff',
        emissiveIntensity: 2.4,
        opacity: 0.85,
      },
      {
        name: 'burst',
        shape: 'sphere',
        args: [0.6, 16, 16],
        color: '#dff6ff',
        emissive: '#7fe3ff',
        emissiveIntensity: 1.8,
        opacity: 0.5,
      },
    ],
  },
};

const blink: VfxDescriptor = {
  id: 'vfx.blink',
  displayName: 'Blink',
  behavior: 'burst',
  durationMs: 400,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'flash',
        shape: 'sphere',
        args: [0.45, 16, 16],
        color: '#e6d2ff',
        emissive: '#b07bff',
        emissiveIntensity: 2.6,
        opacity: 0.75,
      },
    ],
  },
};

const meteor: VfxDescriptor = {
  id: 'vfx.meteor',
  displayName: 'Meteor Impact',
  behavior: 'burst',
  durationMs: 700,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'blast',
        shape: 'sphere',
        args: [0.9, 18, 18],
        color: '#ffd9a0',
        emissive: '#ff6a1a',
        emissiveIntensity: 3,
        opacity: 0.7,
      },
      {
        name: 'shock',
        shape: 'torus',
        args: [1.4, 0.16, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ff8b3d',
        emissive: '#ff4d00',
        emissiveIntensity: 2.2,
      },
    ],
  },
};

/** A ground telegraph marking where a meteor will land. Its lifetime matches the
 *  meteor's default wind-up so it clears right as the strike lands. */
const meteorTelegraph: VfxDescriptor = {
  id: 'vfx.meteor_telegraph',
  displayName: 'Meteor Telegraph',
  behavior: 'static',
  durationMs: 900,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'marker',
        shape: 'torus',
        args: [1.4, 0.08, 10, 32],
        position: [0, 0.05, 0],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ff7a3a',
        emissive: '#ff3b00',
        emissiveIntensity: 1.6,
        opacity: 0.85,
      },
    ],
  },
};

export const VFX: VfxDescriptor[] = [
  fireball,
  arrow,
  heal,
  cast,
  portal,
  frost,
  blink,
  meteor,
  meteorTelegraph,
];
