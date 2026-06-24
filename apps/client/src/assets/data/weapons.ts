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
// Bows are modeled vertically with the RISER (grip) at the local origin, opening
// toward -X (string side) with the convex back toward +X. The grip rotates that
// back toward the aim (+Z) and the string toward the archer (-Z).
const BOW_GRIP: WeaponDescriptor['grip'] = { position: [0.4, 0.95, 0.18], rotation: [0, -Math.PI / 2, 0] };
// The crossbow is a horizontal stock modeled along +Z (the aim), held two-handed.
const CROSSBOW_GRIP: WeaponDescriptor['grip'] = { position: [0.28, 0.92, 0.1], rotation: [0, 0, 0] };
const MACE_GRIP: WeaponDescriptor['grip'] = { position: [0.45, 0.7, 0.1], rotation: [0, 0, -0.3] };

// Shared material palette (kept terse; the enchant carries the "wow").
const STEEL = { metalness: 0.85, roughness: 0.26 };
const DARKSTEEL = { metalness: 0.9, roughness: 0.4 };
const GOLD = { metalness: 0.95, roughness: 0.15 };

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
      { name: 'pommel', shape: 'sphere', args: [0.045, 10, 10], position: [0, -0.01, 0], color: '#9aa2ae', ...STEEL, roughness: 0.4 },
      { name: 'grip', shape: 'cylinder', args: [0.034, 0.034, 0.2, 8], position: [0, 0.1, 0], color: '#5a5f68' },
      { name: 'guard', shape: 'box', args: [0.32, 0.05, 0.08], position: [0, 0.225, 0], color: '#c4ccd6', ...STEEL },
      { name: 'blade', shape: 'box', args: [0.1, 0.6, 0.028], position: [0, 0.55, 0], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'fuller', shape: 'box', args: [0.018, 0.5, 0.032], position: [0, 0.55, 0], color: '#aab2bc', metalness: 0.6, roughness: 0.4 },
      { name: 'tip', shape: 'cone', args: [0.05, 0.16, 4], position: [0, 0.93, 0], color: '#e0e6ee', ...STEEL, enchantable: true },
    ],
  },
};

// Greatblade — a broad two-hander: long grip, ball-tipped crossguard, parrying
// lugs and a wide fullered blade. Clearly heftier than the arming sword.
const greatblade: WeaponDescriptor = {
  id: 'weapon.warrior.greatblade',
  displayName: 'Greatblade',
  grip: SWORD_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'pommel', shape: 'sphere', args: [0.06, 12, 12], position: [0, -0.04, 0], color: '#9aa2ae', ...STEEL, roughness: 0.42 },
      { name: 'grip', shape: 'cylinder', args: [0.04, 0.04, 0.36, 8], position: [0, 0.16, 0], color: '#5a5f68' },
      { name: 'guard', shape: 'box', args: [0.52, 0.07, 0.1], position: [0, 0.37, 0], color: '#c4ccd6', ...STEEL },
      { name: 'quillon.l', shape: 'sphere', args: [0.055, 10, 10], position: [0.26, 0.37, 0], color: '#c4ccd6', ...STEEL },
      { name: 'quillon.r', shape: 'sphere', args: [0.055, 10, 10], position: [-0.26, 0.37, 0], color: '#c4ccd6', ...STEEL },
      { name: 'lug.l', shape: 'cone', args: [0.03, 0.15, 4], position: [0.1, 0.52, 0], rotation: [0, 0, -1.05], color: '#c4ccd6', ...STEEL },
      { name: 'lug.r', shape: 'cone', args: [0.03, 0.15, 4], position: [-0.1, 0.52, 0], rotation: [0, 0, 1.05], color: '#c4ccd6', ...STEEL },
      { name: 'blade', shape: 'box', args: [0.2, 0.98, 0.042], position: [0, 0.89, 0], color: '#e0e6ee', ...STEEL, roughness: 0.22, enchantable: true },
      { name: 'fuller', shape: 'box', args: [0.045, 0.84, 0.05], position: [0, 0.89, 0], color: '#aab2bc', metalness: 0.6, roughness: 0.4 },
      { name: 'tip', shape: 'cone', args: [0.1, 0.28, 4], position: [0, 1.52, 0], color: '#e0e6ee', ...STEEL, roughness: 0.22, enchantable: true },
    ],
  },
};

// Riftblade — the biggest blade: a brutal cleaver greatsword with an angled
// spiked crossguard, an asymmetric back-edge and a hooked tip. Distinct, mean.
const runeblade: WeaponDescriptor = {
  id: 'weapon.warrior.runeblade',
  displayName: 'Riftblade',
  grip: SWORD_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'pommel', shape: 'sphere', args: [0.065, 12, 12], position: [0, -0.05, 0], color: '#9aa2ae', ...STEEL },
      { name: 'grip', shape: 'cylinder', args: [0.042, 0.042, 0.34, 8], position: [0, 0.15, 0], color: '#4a4e55' },
      { name: 'hub', shape: 'box', args: [0.16, 0.09, 0.1], position: [0, 0.35, 0], color: '#c4ccd6', ...STEEL },
      { name: 'spike.l', shape: 'cone', args: [0.045, 0.36, 4], position: [0.15, 0.44, 0], rotation: [0, 0, -0.8], color: '#c4ccd6', ...STEEL },
      { name: 'spike.r', shape: 'cone', args: [0.045, 0.36, 4], position: [-0.15, 0.44, 0], rotation: [0, 0, 0.8], color: '#c4ccd6', ...STEEL },
      { name: 'blade', shape: 'box', args: [0.26, 1.2, 0.05], position: [0, 0.98, 0], color: '#e0e6ee', ...STEEL, roughness: 0.2, enchantable: true },
      { name: 'edge', shape: 'box', args: [0.05, 1.04, 0.062], position: [0.08, 0.98, 0], color: '#aab2bc', metalness: 0.6, roughness: 0.34 },
      { name: 'hook', shape: 'cone', args: [0.075, 0.22, 3], position: [-0.16, 1.49, 0], rotation: [0, 0, 1.45], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'tip', shape: 'cone', args: [0.13, 0.34, 4], position: [0, 1.75, 0], color: '#e0e6ee', ...STEEL, roughness: 0.2, enchantable: true },
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
      { name: 'shaft', shape: 'cylinder', args: [0.026, 0.032, 1.6, 8], position: [0, 0.62, 0], color: '#9aa0aa' },
      { name: 'ferrule', shape: 'cylinder', args: [0.042, 0.042, 0.06, 8], position: [0, 1.39, 0], color: '#c4ccd6', ...STEEL },
      { name: 'cup', shape: 'cone', args: [0.075, 0.11, 6], position: [0, 1.46, 0], rotation: [Math.PI, 0, 0], color: '#aeb6c0', ...STEEL },
      { name: 'orb', shape: 'sphere', args: [0.11, 16, 16], position: [0, 1.55, 0], color: '#e0e6ee', metalness: 0.6, roughness: 0.3, enchantable: true },
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
      { name: 'shaft', shape: 'cylinder', args: [0.027, 0.033, 1.65, 8], position: [0, 0.64, 0], color: '#9aa0aa' },
      { name: 'band', shape: 'cylinder', args: [0.045, 0.045, 0.05, 8], position: [0, 0.9, 0], color: '#c4ccd6', ...STEEL },
      { name: 'cradle', shape: 'torus', args: [0.095, 0.02, 6, 12], position: [0, 1.53, 0], rotation: [Math.PI / 2, 0, 0], color: '#c4ccd6', ...STEEL },
      { name: 'prong.l', shape: 'cone', args: [0.02, 0.2, 5], position: [0.095, 1.61, 0], rotation: [0, 0, -0.5], color: '#c4ccd6', ...STEEL },
      { name: 'prong.r', shape: 'cone', args: [0.02, 0.2, 5], position: [-0.095, 1.61, 0], rotation: [0, 0, 0.5], color: '#c4ccd6', ...STEEL },
      { name: 'core', shape: 'sphere', args: [0.1, 16, 16], position: [0, 1.53, 0], color: '#e0e6ee', metalness: 0.6, roughness: 0.3, enchantable: true },
    ],
  },
};

const voidScepter: WeaponDescriptor = {
  id: 'weapon.mage.voidscepter',
  displayName: 'Void Staff',
  grip: STAFF_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'shaft', shape: 'cylinder', args: [0.026, 0.032, 1.6, 8], position: [0, 0.62, 0], color: '#9aa0aa' },
      { name: 'collar', shape: 'cylinder', args: [0.045, 0.045, 0.06, 8], position: [0, 1.38, 0], color: '#9aa2ae', metalness: 0.6, roughness: 0.4 },
      { name: 'halo', shape: 'torus', args: [0.13, 0.018, 8, 18], position: [0, 1.51, 0], color: '#c4ccd6', metalness: 0.6, roughness: 0.3 },
      { name: 'core', shape: 'sphere', args: [0.1, 16, 16], position: [0, 1.51, 0], color: '#e0e6ee', metalness: 0.6, roughness: 0.3, enchantable: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Archer — bow line (limb + tips are enchantable)
// ---------------------------------------------------------------------------

// Hunting Bow — a clean recurve. Modeled on the CHORD: the string runs through
// the local origin (the grip / nock point the weapon pivots around), the limb
// belly bulges toward the target (+X → aim), recurved tips at the chord ends.
const bow: WeaponDescriptor = {
  id: 'weapon.bow',
  displayName: 'Hunting Bow',
  grip: BOW_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'grip', shape: 'cylinder', args: [0.03, 0.034, 0.3, 8], position: [0.46, 0, 0], color: '#4a3a2a' },
      { name: 'limb', shape: 'torus', args: [0.5, 0.03, 10, 28, Math.PI], position: [0, 0, 0], rotation: [0, 0, -Math.PI / 2], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'string', shape: 'cylinder', args: [0.005, 0.005, 1.0, 4], position: [0, 0, 0], color: '#d8d2c4' },
      { name: 'tip.t', shape: 'cone', args: [0.028, 0.11, 5], position: [0, 0.52, 0], rotation: [0, 0, -0.5], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'tip.b', shape: 'cone', args: [0.028, 0.11, 5], position: [0, -0.52, 0], rotation: [0, 0, Math.PI + 0.5], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'rest', shape: 'box', args: [0.05, 0.02, 0.06], position: [0.42, 0, 0], color: '#4a3a2a' },
    ],
  },
};

// War Recurve — bigger, thicker double-curve limbs with a sculpted metal riser
// and a sight window; a heavier silhouette than the hunting bow. Chord-centered.
const warRecurve: WeaponDescriptor = {
  id: 'weapon.archer.recurve',
  displayName: 'War Recurve',
  grip: BOW_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'grip', shape: 'cylinder', args: [0.034, 0.04, 0.36, 8], position: [0.54, 0, 0], color: '#3a3e45' },
      { name: 'window', shape: 'box', args: [0.04, 0.16, 0.05], position: [0.46, 0, 0], color: '#5a5f68', metalness: 0.6, roughness: 0.4 },
      { name: 'limb', shape: 'torus', args: [0.58, 0.045, 10, 30, Math.PI], position: [0, 0, 0], rotation: [0, 0, -Math.PI / 2], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'string', shape: 'cylinder', args: [0.006, 0.006, 1.16, 4], position: [0, 0, 0], color: '#cfc9ba' },
      { name: 'tip.t', shape: 'cone', args: [0.034, 0.18, 5], position: [0, 0.6, 0], rotation: [0, 0, -0.7], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'tip.b', shape: 'cone', args: [0.034, 0.18, 5], position: [0, -0.6, 0], rotation: [0, 0, Math.PI + 0.7], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'rest', shape: 'box', args: [0.06, 0.02, 0.07], position: [0.5, 0, 0], color: '#3a3e45' },
    ],
  },
};

// Crossbow — a horizontal stock along the aim (+Z) with a perpendicular steel
// prod and drawn string at the front, a flight groove on top, and a pistol grip.
const dawnbow: WeaponDescriptor = {
  id: 'weapon.archer.dawnbow',
  displayName: 'Crossbow',
  grip: CROSSBOW_GRIP,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'stock', shape: 'box', args: [0.06, 0.07, 0.72], position: [0, 0, 0.26], color: '#5a3a22' },
      { name: 'grip', shape: 'cylinder', args: [0.028, 0.03, 0.18, 8], position: [0, -0.11, 0.02], rotation: [0.35, 0, 0], color: '#3a2a1a' },
      { name: 'rail', shape: 'box', args: [0.022, 0.03, 0.6], position: [0, 0.05, 0.3], color: '#c4ccd6', ...STEEL },
      { name: 'prod', shape: 'box', args: [0.78, 0.035, 0.05], position: [0, 0.03, 0.52], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'prod.l', shape: 'cone', args: [0.03, 0.13, 4], position: [0.39, 0.03, 0.52], rotation: [0, 0, -Math.PI / 2], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'prod.r', shape: 'cone', args: [0.03, 0.13, 4], position: [-0.39, 0.03, 0.52], rotation: [0, 0, Math.PI / 2], color: '#e0e6ee', ...STEEL, enchantable: true },
      { name: 'string', shape: 'cylinder', args: [0.005, 0.005, 0.76, 4], position: [0, 0.04, 0.42], rotation: [0, 0, Math.PI / 2], color: '#d8d2c4' },
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
      { name: 'shaft', shape: 'cylinder', args: [0.035, 0.04, 0.78, 8], position: [0, 0.39, 0], color: '#9aa0aa' },
      { name: 'grip', shape: 'cylinder', args: [0.042, 0.042, 0.2, 8], position: [0, 0.12, 0], color: '#7c828b' },
      { name: 'collar', shape: 'cylinder', args: [0.06, 0.06, 0.05, 8], position: [0, 0.78, 0], color: '#c4ccd6', ...STEEL },
      { name: 'head', shape: 'sphere', args: [0.15, 16, 16], position: [0, 0.88, 0], color: '#e0e6ee', metalness: 0.6, roughness: 0.3, enchantable: true },
      { name: 'stud', shape: 'sphere', args: [0.04, 8, 8], position: [0, 1.04, 0], color: '#c4ccd6', ...STEEL, enchantable: true },
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
      { name: 'shaft', shape: 'cylinder', args: [0.038, 0.045, 0.8, 8], position: [0, 0.4, 0], color: '#9aa0aa' },
      { name: 'collar', shape: 'cylinder', args: [0.065, 0.065, 0.06, 8], position: [0, 0.8, 0], color: '#c4ccd6', ...STEEL },
      { name: 'head', shape: 'sphere', args: [0.11, 12, 12], position: [0, 0.9, 0], color: '#e0e6ee', metalness: 0.6, roughness: 0.3, enchantable: true },
      { name: 'flange.x+', shape: 'box', args: [0.06, 0.18, 0.09], position: [0.12, 0.9, 0], color: '#c4ccd6', ...STEEL, enchantable: true },
      { name: 'flange.x-', shape: 'box', args: [0.06, 0.18, 0.09], position: [-0.12, 0.9, 0], color: '#c4ccd6', ...STEEL, enchantable: true },
      { name: 'flange.z+', shape: 'box', args: [0.09, 0.18, 0.06], position: [0, 0.9, 0.12], color: '#c4ccd6', ...STEEL, enchantable: true },
      { name: 'stud', shape: 'sphere', args: [0.045, 8, 8], position: [0, 1.08, 0], color: '#c4ccd6', ...STEEL },
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
      { name: 'shaft', shape: 'cylinder', args: [0.036, 0.042, 0.82, 8], position: [0, 0.41, 0], color: '#9aa0aa' },
      { name: 'collar', shape: 'cylinder', args: [0.06, 0.06, 0.05, 8], position: [0, 0.82, 0], color: '#c4ccd6', ...STEEL },
      { name: 'halo', shape: 'torus', args: [0.2, 0.02, 8, 20], position: [0, 0.94, 0], rotation: [Math.PI / 2, 0, 0], color: '#c4ccd6', metalness: 0.6, roughness: 0.3, enchantable: true },
      { name: 'orb', shape: 'sphere', args: [0.15, 16, 16], position: [0, 0.94, 0], color: '#e0e6ee', metalness: 0.6, roughness: 0.3, enchantable: true },
      { name: 'crown', shape: 'cone', args: [0.03, 0.1, 5], position: [0, 1.14, 0], color: '#c4ccd6', ...STEEL },
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
