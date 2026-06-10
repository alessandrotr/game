import type { WeaponDescriptor } from '@arena/shared';

/** Weapons modeled vertically (origin at the grip) and mounted via `grip`. */

const sword: WeaponDescriptor = {
  id: 'weapon.sword',
  displayName: 'Sword',
  grip: { position: [0.5, 0.85, 0.1], rotation: [0, 0, -0.5] },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'handle',
        shape: 'cylinder',
        args: [0.05, 0.05, 0.26, 8],
        position: [0, 0.13, 0],
        color: '#5a3b22',
      },
      {
        name: 'guard',
        shape: 'box',
        args: [0.3, 0.06, 0.1],
        position: [0, 0.28, 0],
        color: '#999',
        metalness: 0.6,
      },
      {
        name: 'blade',
        shape: 'box',
        args: [0.1, 0.8, 0.03],
        position: [0, 0.72, 0],
        color: '#cdd3dd',
        metalness: 0.8,
        roughness: 0.3,
      },
    ],
  },
};

const staff: WeaponDescriptor = {
  id: 'weapon.staff',
  displayName: 'Staff',
  grip: { position: [0.45, 0.7, 0.1], rotation: [0, 0, -0.12] },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'shaft',
        shape: 'cylinder',
        args: [0.04, 0.04, 1.4, 8],
        position: [0, 0.7, 0],
        color: '#6b4a2a',
      },
      {
        name: 'orb',
        shape: 'sphere',
        args: [0.13, 16, 16],
        position: [0, 1.45, 0],
        color: '#9fd0ff',
        emissive: '#4aa3ff',
        emissiveIntensity: 1.8,
      },
    ],
  },
};

const bow: WeaponDescriptor = {
  id: 'weapon.bow',
  displayName: 'Bow',
  grip: { position: [0.42, 0.9, 0.12], rotation: [0, Math.PI / 2, 0] },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'limb',
        shape: 'torus',
        args: [0.45, 0.04, 12, 24, Math.PI],
        position: [0, 0, 0],
        rotation: [0, 0, -Math.PI / 2],
        color: '#7a4f2a',
      },
      {
        name: 'string',
        shape: 'cylinder',
        args: [0.008, 0.008, 0.9, 4],
        position: [0, 0, 0],
        color: '#d8d2c4',
      },
    ],
  },
};

const mace: WeaponDescriptor = {
  id: 'weapon.mace',
  displayName: 'Mace',
  grip: { position: [0.45, 0.7, 0.1], rotation: [0, 0, -0.3] },
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'shaft',
        shape: 'cylinder',
        args: [0.04, 0.04, 0.8, 8],
        position: [0, 0.4, 0],
        color: '#5a3b22',
      },
      {
        name: 'head',
        shape: 'sphere',
        args: [0.16, 12, 12],
        position: [0, 0.86, 0],
        color: '#caa24a',
        metalness: 0.5,
        roughness: 0.4,
      },
    ],
  },
};

export const WEAPONS: WeaponDescriptor[] = [sword, staff, bow, mace];
