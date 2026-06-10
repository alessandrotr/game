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

/** Arcane Bolt: a fast violet projectile (the mage's long-range bolt). */
const arcaneBolt: VfxDescriptor = {
  id: 'vfx.arcane_bolt',
  displayName: 'Arcane Bolt',
  behavior: 'projectile',
  speed: 26,
  durationMs: 2000,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'core',
        shape: 'sphere',
        args: [0.16, 16, 16],
        color: '#efe3ff',
        emissive: '#b07bff',
        emissiveIntensity: 3,
      },
      {
        name: 'aura',
        shape: 'sphere',
        args: [0.28, 16, 16],
        color: '#c79bff',
        emissive: '#7a2bff',
        emissiveIntensity: 2,
        opacity: 0.55,
      },
    ],
  },
};

/** Shockwave: an orange ground ring bursting out from the caster. */
const shockwave: VfxDescriptor = {
  id: 'vfx.shockwave',
  displayName: 'Shockwave',
  behavior: 'burst',
  durationMs: 550,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [1.2, 0.16, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ffd9a0',
        emissive: '#ff7a1a',
        emissiveIntensity: 2.6,
      },
      {
        name: 'core',
        shape: 'sphere',
        args: [0.55, 16, 16],
        color: '#ffe6b0',
        emissive: '#ff9d3a',
        emissiveIntensity: 1.8,
        opacity: 0.5,
      },
    ],
  },
};

/** Arcane Blast: a violet explosion at the strike point. */
const arcaneBlast: VfxDescriptor = {
  id: 'vfx.arcane_blast',
  displayName: 'Arcane Blast',
  behavior: 'burst',
  durationMs: 650,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'blast',
        shape: 'sphere',
        args: [0.95, 18, 18],
        color: '#e9d2ff',
        emissive: '#9b4dff',
        emissiveIntensity: 3,
        opacity: 0.7,
      },
      {
        name: 'shock',
        shape: 'torus',
        args: [1.5, 0.16, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#c79bff',
        emissive: '#7a2bff',
        emissiveIntensity: 2.2,
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
  shockwave,
  arcaneBolt,
  arcaneBlast,
];
