import type { WeaponDescriptor } from '@arena/shared';

/**
 * Weapons modeled vertically (origin at the grip) and mounted via `grip`. Each is
 * built from a handful of primitives for a clean, stylized low-poly read (no art
 * downloads). The blade / orb / mace-head — the "showpiece" — is tagged
 * `enchantable`, so an equipped enchant swaps just those parts to the animated
 * enchant material (see `render/enchantMaterial`). Ids double as cosmetic ids
 * (`weapon.*`) so equipping one in the loadout renders that descriptor directly.
 */

// Per-class grip transforms — shared by every weapon in that class's line so the
// silhouette swap keeps sitting correctly in the hand.
const SWORD_GRIP: WeaponDescriptor['grip'] = { position: [0.5, 0.85, 0.1], rotation: [0, 0, -0.5] };
const STAFF_GRIP: WeaponDescriptor['grip'] = { position: [0.45, 0.7, 0.1], rotation: [0, 0, -0.12] };
const BOW_GRIP: WeaponDescriptor['grip'] = { position: [0.42, 0.9, 0.12], rotation: [0, Math.PI / 2, 0] };
const MACE_GRIP: WeaponDescriptor['grip'] = { position: [0.45, 0.7, 0.1], rotation: [0, 0, -0.3] };

// Shared material palettes (kept terse; the enchant carries the "wow").
const STEEL = { metalness: 0.85, roughness: 0.26 };
const DARKSTEEL = { metalness: 0.9, roughness: 0.32 };
const GOLD = { metalness: 0.72, roughness: 0.3 };

// ---------------------------------------------------------------------------
// Warrior — sword line (blade + tip are enchantable)
// ---------------------------------------------------------------------------

const sword: WeaponDescriptor = {
  id: 'weapon.sword',
  displayName: 'Arming Sword',
  grip: SWORD_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'pommel', shape: 'sphere', args: [0.045, 10, 10], position: [0, -0.01, 0], color: '#6a7079', ...STEEL, roughness: 0.4 },
      { name: 'grip', shape: 'cylinder', args: [0.034, 0.034, 0.2, 8], position: [0, 0.1, 0], color: '#4a3522' },
      { name: 'guard', shape: 'box', args: [0.32, 0.05, 0.08], position: [0, 0.225, 0], color: '#8a929c', ...GOLD },
      { name: 'blade', shape: 'box', args: [0.1, 0.6, 0.028], position: [0, 0.55, 0], color: '#cdd3dd', ...STEEL, enchantable: true },
      { name: 'fuller', shape: 'box', args: [0.018, 0.5, 0.032], position: [0, 0.55, 0], color: '#9aa3ad', metalness: 0.6, roughness: 0.4 },
      { name: 'tip', shape: 'cone', args: [0.05, 0.16, 4], position: [0, 0.93, 0], color: '#cdd3dd', ...STEEL, enchantable: true },
    ],
  },
};

const greatblade: WeaponDescriptor = {
  id: 'weapon.warrior.greatblade',
  displayName: 'Greatblade',
  grip: SWORD_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'pommel', shape: 'sphere', args: [0.052, 10, 10], position: [0, -0.02, 0], color: '#5a6069', ...STEEL, roughness: 0.42 },
      { name: 'grip', shape: 'cylinder', args: [0.038, 0.038, 0.28, 8], position: [0, 0.13, 0], color: '#3a2a1a' },
      { name: 'guard', shape: 'box', args: [0.42, 0.06, 0.09], position: [0, 0.29, 0], color: '#b0b8c2', ...GOLD },
      { name: 'blade', shape: 'box', args: [0.16, 0.78, 0.034], position: [0, 0.7, 0], color: '#d6dce6', ...STEEL, roughness: 0.24, enchantable: true },
      { name: 'fuller', shape: 'box', args: [0.03, 0.66, 0.038], position: [0, 0.7, 0], color: '#aab2bc', metalness: 0.6, roughness: 0.4 },
      { name: 'tip', shape: 'cone', args: [0.082, 0.22, 4], position: [0, 1.2, 0], color: '#d6dce6', ...STEEL, roughness: 0.24, enchantable: true },
    ],
  },
};

const runeblade: WeaponDescriptor = {
  id: 'weapon.warrior.runeblade',
  displayName: 'Runeblade',
  grip: SWORD_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'pommel', shape: 'sphere', args: [0.05, 10, 10], position: [0, -0.02, 0], color: '#2a2d33', ...DARKSTEEL },
      { name: 'grip', shape: 'cylinder', args: [0.036, 0.036, 0.24, 8], position: [0, 0.12, 0], color: '#1f1f24' },
      { name: 'guard', shape: 'box', args: [0.38, 0.06, 0.085], position: [0, 0.27, 0], color: '#2a2d33', ...DARKSTEEL },
      { name: 'blade', shape: 'box', args: [0.13, 0.8, 0.03], position: [0, 0.72, 0], color: '#23262c', ...DARKSTEEL, enchantable: true },
      { name: 'rune', shape: 'box', args: [0.026, 0.66, 0.034], position: [0, 0.72, 0], color: '#15171b', metalness: 0.5, roughness: 0.6 },
      { name: 'tip', shape: 'cone', args: [0.066, 0.2, 4], position: [0, 1.18, 0], color: '#23262c', ...DARKSTEEL, enchantable: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Mage — staff line (orb / core is enchantable)
// ---------------------------------------------------------------------------

const staff: WeaponDescriptor = {
  id: 'weapon.staff',
  displayName: 'Apprentice Staff',
  grip: STAFF_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.035, 0.04, 1.35, 8], position: [0, 0.67, 0], color: '#6b4a2a' },
      { name: 'ferrule', shape: 'cylinder', args: [0.05, 0.05, 0.06, 8], position: [0, 1.33, 0], color: '#8a929c', ...GOLD },
      { name: 'cup', shape: 'cone', args: [0.09, 0.12, 6], position: [0, 1.4, 0], rotation: [Math.PI, 0, 0], color: '#7a5a32', ...GOLD },
      { name: 'orb', shape: 'sphere', args: [0.12, 16, 16], position: [0, 1.5, 0], color: '#9fd0ff', emissive: '#4aa3ff', emissiveIntensity: 1.6, enchantable: true },
    ],
  },
};

const archonStaff: WeaponDescriptor = {
  id: 'weapon.mage.archonstaff',
  displayName: 'Archon Staff',
  grip: STAFF_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.036, 0.042, 1.4, 8], position: [0, 0.7, 0], color: '#4a3a5a' },
      { name: 'band', shape: 'cylinder', args: [0.05, 0.05, 0.05, 8], position: [0, 0.92, 0], color: '#e8b24a', ...GOLD },
      { name: 'cradle', shape: 'torus', args: [0.1, 0.022, 6, 12], position: [0, 1.48, 0], rotation: [Math.PI / 2, 0, 0], color: '#e8b24a', ...GOLD },
      { name: 'prong.l', shape: 'cone', args: [0.022, 0.22, 5], position: [0.1, 1.56, 0], rotation: [0, 0, -0.5], color: '#e8b24a', ...GOLD },
      { name: 'prong.r', shape: 'cone', args: [0.022, 0.22, 5], position: [-0.1, 1.56, 0], rotation: [0, 0, 0.5], color: '#e8b24a', ...GOLD },
      { name: 'core', shape: 'sphere', args: [0.11, 6, 5], position: [0, 1.5, 0], color: '#b07aff', emissive: '#7a3aff', emissiveIntensity: 1.4, enchantable: true },
    ],
  },
};

const voidScepter: WeaponDescriptor = {
  id: 'weapon.mage.voidscepter',
  displayName: 'Void Scepter',
  grip: STAFF_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.034, 0.04, 1.3, 8], position: [0, 0.65, 0], color: '#26222e' },
      { name: 'collar', shape: 'cylinder', args: [0.05, 0.05, 0.06, 8], position: [0, 1.28, 0], color: '#5a4a6a', metalness: 0.6, roughness: 0.4 },
      { name: 'halo', shape: 'torus', args: [0.15, 0.018, 8, 18], position: [0, 1.5, 0], color: '#7a5cff', emissive: '#5a3ad0', emissiveIntensity: 1.2 },
      { name: 'core', shape: 'sphere', args: [0.1, 6, 5], position: [0, 1.5, 0], color: '#1a1622', emissive: '#3a2a5a', emissiveIntensity: 0.6, enchantable: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Archer — bow line (limb + tips are enchantable)
// ---------------------------------------------------------------------------

const bow: WeaponDescriptor = {
  id: 'weapon.bow',
  displayName: 'Hunting Bow',
  grip: BOW_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'limb', shape: 'torus', args: [0.45, 0.04, 12, 24, Math.PI], position: [0, 0, 0], rotation: [0, 0, -Math.PI / 2], color: '#7a4f2a', enchantable: true },
      { name: 'riser', shape: 'cylinder', args: [0.05, 0.05, 0.2, 8], position: [0, 0, 0], color: '#4a3522' },
      { name: 'string', shape: 'cylinder', args: [0.006, 0.006, 0.9, 4], position: [0, 0, 0], color: '#d8d2c4' },
      { name: 'nock.t', shape: 'sphere', args: [0.022, 8, 8], position: [0, 0.45, 0], color: '#3a2d1a' },
      { name: 'nock.b', shape: 'sphere', args: [0.022, 8, 8], position: [0, -0.45, 0], color: '#3a2d1a' },
    ],
  },
};

const warRecurve: WeaponDescriptor = {
  id: 'weapon.archer.recurve',
  displayName: 'War Recurve',
  grip: BOW_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'limb', shape: 'torus', args: [0.5, 0.045, 12, 24, Math.PI], position: [0, 0, 0], rotation: [0, 0, -Math.PI / 2], color: '#5a3a22', enchantable: true },
      { name: 'riser', shape: 'cylinder', args: [0.05, 0.055, 0.26, 8], position: [0, 0, 0], color: '#2a2a2e', metalness: 0.5, roughness: 0.5 },
      { name: 'string', shape: 'cylinder', args: [0.006, 0.006, 1.0, 4], position: [0, 0, 0], color: '#cfc9ba' },
      { name: 'tip.t', shape: 'cone', args: [0.03, 0.16, 4], position: [0, 0.52, 0], color: '#c9d2dd', ...STEEL, enchantable: true },
      { name: 'tip.b', shape: 'cone', args: [0.03, 0.16, 4], position: [0, -0.52, 0], rotation: [Math.PI, 0, 0], color: '#c9d2dd', ...STEEL, enchantable: true },
    ],
  },
};

const dawnbow: WeaponDescriptor = {
  id: 'weapon.archer.dawnbow',
  displayName: 'Dawnbow',
  grip: BOW_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'limb', shape: 'torus', args: [0.6, 0.04, 12, 28, Math.PI * 0.8], position: [0, 0, 0], rotation: [0, 0, -Math.PI * 0.9], color: '#b9892e', ...GOLD, enchantable: true },
      { name: 'riser', shape: 'cylinder', args: [0.045, 0.05, 0.24, 8], position: [0, 0, 0], color: '#6b4a2a' },
      { name: 'string', shape: 'cylinder', args: [0.005, 0.005, 1.0, 4], position: [0, 0, 0], color: '#efe7cc' },
      { name: 'nock.t', shape: 'sphere', args: [0.032, 10, 10], position: [0, 0.49, 0.12], color: '#ffd86b', emissive: '#ffb43a', emissiveIntensity: 1.2, enchantable: true },
      { name: 'nock.b', shape: 'sphere', args: [0.032, 10, 10], position: [0, -0.49, 0.12], color: '#ffd86b', emissive: '#ffb43a', emissiveIntensity: 1.2, enchantable: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Priest — mace line (head / flanges are enchantable)
// ---------------------------------------------------------------------------

const mace: WeaponDescriptor = {
  id: 'weapon.mace',
  displayName: 'Acolyte Mace',
  grip: MACE_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.035, 0.04, 0.78, 8], position: [0, 0.39, 0], color: '#5a3b22' },
      { name: 'grip', shape: 'cylinder', args: [0.042, 0.042, 0.2, 8], position: [0, 0.12, 0], color: '#3a2a1a' },
      { name: 'collar', shape: 'cylinder', args: [0.06, 0.06, 0.05, 8], position: [0, 0.78, 0], color: '#e8c45a', ...GOLD },
      { name: 'head', shape: 'sphere', args: [0.15, 16, 16], position: [0, 0.88, 0], color: '#caa24a', metalness: 0.6, roughness: 0.4, enchantable: true },
      { name: 'stud', shape: 'sphere', args: [0.04, 8, 8], position: [0, 1.04, 0], color: '#e8c45a', ...GOLD, enchantable: true },
    ],
  },
};

const flangedMace: WeaponDescriptor = {
  id: 'weapon.priest.flanged',
  displayName: 'Flanged Mace',
  grip: MACE_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.038, 0.045, 0.8, 8], position: [0, 0.4, 0], color: '#4a3520' },
      { name: 'collar', shape: 'cylinder', args: [0.065, 0.065, 0.06, 8], position: [0, 0.8, 0], color: '#e8c45a', ...GOLD },
      { name: 'head', shape: 'sphere', args: [0.11, 12, 12], position: [0, 0.9, 0], color: '#d8b25a', metalness: 0.6, roughness: 0.4, enchantable: true },
      { name: 'flange.x+', shape: 'box', args: [0.06, 0.18, 0.09], position: [0.12, 0.9, 0], color: '#e8c45a', ...GOLD, enchantable: true },
      { name: 'flange.x-', shape: 'box', args: [0.06, 0.18, 0.09], position: [-0.12, 0.9, 0], color: '#e8c45a', ...GOLD, enchantable: true },
      { name: 'flange.z+', shape: 'box', args: [0.09, 0.18, 0.06], position: [0, 0.9, 0.12], color: '#e8c45a', ...GOLD, enchantable: true },
      { name: 'stud', shape: 'sphere', args: [0.045, 8, 8], position: [0, 1.08, 0], color: '#e8c45a', ...GOLD },
    ],
  },
};

const sunCenser: WeaponDescriptor = {
  id: 'weapon.priest.censer',
  displayName: 'Sun Censer',
  grip: MACE_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.036, 0.042, 0.82, 8], position: [0, 0.41, 0], color: '#c9a24a', ...GOLD },
      { name: 'collar', shape: 'cylinder', args: [0.06, 0.06, 0.05, 8], position: [0, 0.82, 0], color: '#e8c45a', ...GOLD },
      { name: 'halo', shape: 'torus', args: [0.2, 0.02, 8, 20], position: [0, 0.94, 0], rotation: [Math.PI / 2, 0, 0], color: '#ffd86b', emissive: '#ffb43a', emissiveIntensity: 1.0, enchantable: true },
      { name: 'orb', shape: 'sphere', args: [0.15, 16, 16], position: [0, 0.94, 0], color: '#fff1c4', emissive: '#ffd86b', emissiveIntensity: 1.0, enchantable: true },
      { name: 'crown', shape: 'cone', args: [0.03, 0.1, 5], position: [0, 1.14, 0], color: '#e8c45a', ...GOLD },
    ],
  },
};

const katana: WeaponDescriptor = {
  id: 'weapon.katana',
  displayName: 'Katana',
  grip: SWORD_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'pommel', shape: 'cylinder', args: [0.026, 0.026, 0.04, 8], position: [0, -0.01, 0], color: '#2a2d33', ...DARKSTEEL },
      { name: 'grip', shape: 'cylinder', args: [0.026, 0.026, 0.22, 8], position: [0, 0.1, 0], color: '#1a1a1c' },
      { name: 'tsuba', shape: 'cylinder', args: [0.08, 0.08, 0.02, 16], position: [0, 0.22, 0], color: '#b9892e', ...GOLD },
      { name: 'blade', shape: 'box', args: [0.05, 0.72, 0.016], position: [0.01, 0.58, 0], rotation: [0, 0, 0.02], color: '#e8edf5', ...STEEL, enchantable: true },
      { name: 'habaki', shape: 'box', args: [0.054, 0.05, 0.022], position: [0, 0.245, 0], color: '#b9892e', ...GOLD },
      { name: 'tip', shape: 'cone', args: [0.025, 0.1, 4], position: [0.017, 0.98, 0], rotation: [0, 0, 0.1], color: '#e8edf5', ...STEEL, enchantable: true },
    ],
  },
};

export const WEAPONS: WeaponDescriptor[] = [
  // Warrior
  sword,
  greatblade,
  runeblade,
  // Mage
  staff,
  archonStaff,
  voidScepter,
  // Archer
  bow,
  warRecurve,
  dawnbow,
  // Priest
  mace,
  flangedMace,
  sunCenser,
  // Ninja
  katana,
];
