/**
 * THE ability catalog. This object is the single edit point for ability content:
 * to add an ability, add one entry here and bind it to a class slot in
 * {@link CLASS_LOADOUTS}. The server executor and the client UI/VFX are entirely
 * data-driven off these definitions — no switch statements, no per-ability code.
 *
 * Each entry is an {@link AbilityDef}: cost/timing/reach (the tunable flat fields)
 * + an ordered list of composable {@link Effect}s describing what it does. The
 * four class kits below double as worked examples covering every mechanic
 * (damage, AoE, skillshots, heal, DoT/HoT, shield, slow, haste, attack-speed,
 * damage-amp, stun, root, silence, knockback, dash, unit-targeting).
 */

import type { CharacterClass } from '../assets.js';
import type { AbilityDef } from './effects.js';

// Shared visual tags the client already renders (keeps new projectiles visible).
const VFX_FIRE = 'fireball';
const VFX_ARCANE = 'arcane_bolt';

export const ABILITY_REGISTRY = {
  // === Mage — the canonical ranged-burst kit (migrated 1:1, frost gains a slow) ===
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    icon: 'Flame',
    aim: 'direction',
    cooldownMs: 500,
    manaCost: 20,
    castTimeMs: 0,
    range: 30,
    damage: 20,
    projectileSpeed: 35,
    projectileRange: 30,
    projectileRadius: 0.8,
    effects: [
      {
        type: 'projectile',
        speed: 35,
        range: 30,
        radius: 0.8,
        vfx: VFX_FIRE,
        onHit: [{ type: 'damage', amount: 20 }],
      },
    ],
  },
  frost_nova: {
    id: 'frost_nova',
    name: 'Frost Nova',
    icon: 'Snowflake',
    aim: 'self',
    cooldownMs: 5000,
    manaCost: 60,
    castTimeMs: 0,
    range: 7,
    damage: 20,
    aoeRadius: 7,
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 7,
        onHit: [
          { type: 'damage', amount: 20 },
          // Freezes the enemy solid — a full stun for 2s.
          { type: 'status', status: { kind: 'stun', durationMs: 2000 } },
        ],
      },
    ],
  },
  arcane_bolt: {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    icon: 'Zap',
    aim: 'direction',
    cooldownMs: 3000,
    manaCost: 40,
    castTimeMs: 0,
    range: 50,
    damage: 30,
    // A long-range, fast "sniper" bolt.
    projectileSpeed: 50,
    projectileRange: 50,
    projectileRadius: 0.6,
    effects: [
      {
        type: 'projectile',
        speed: 50,
        range: 50,
        radius: 0.6,
        vfx: VFX_ARCANE,
        onHit: [{ type: 'damage', amount: 30 }],
      },
    ],
  },
  arcane_blast: {
    id: 'arcane_blast',
    name: 'Arcane Blast',
    icon: 'Sparkles',
    aim: 'point',
    cooldownMs: 10000,
    manaCost: 100,
    castTimeMs: 500,
    range: 16,
    damage: 55,
    aoeRadius: 4,
    effects: [
      {
        type: 'aoe',
        at: 'point',
        radius: 4,
        onHit: [{ type: 'damage', amount: 55 }],
      },
    ],
  },

  // === Warrior — durable bruiser: melee AoE + bleed, gap-close, shield, slam ult ===
  cleave: {
    id: 'cleave',
    name: 'Cleave',
    icon: 'Swords',
    aim: 'direction',
    cooldownMs: 1000,
    manaCost: 10,
    castTimeMs: 0,
    range: 4,
    damage: 20,
    aoeRadius: 4,
    // A 180° swing in front of the warrior (aimed at the cursor); flat hit, no bleed.
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 4,
        arc: 180,
        onHit: [{ type: 'damage', amount: 20 }],
      },
    ],
  },
  // Warrior basic strike (Q) — a fast frontal burst. Replaces `cleave` in the
  // kit, but `cleave` is kept in the catalog (saved) for reuse / future swaps.
  smash: {
    id: 'smash',
    name: 'Smash',
    icon: 'Swords',
    aim: 'self',
    cooldownMs: 1000,
    manaCost: 10,
    castTimeMs: 0,
    range: 2,
    damage: 20,
    aoeRadius: 2,
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 2,
        onHit: [{ type: 'damage', amount: 20 }],
      },
    ],
  },
  charge: {
    id: 'charge',
    name: 'Charge',
    icon: 'Wind',
    aim: 'direction',
    cooldownMs: 7000,
    manaCost: 20,
    castTimeMs: 0,
    range: 12,
    damage: 0,
    // A fast gap-closing lunge (faster than a sprint), no impact.
    effects: [{ type: 'dash', distance: 12, speed: 34 }],
  },
  shield_wall: {
    id: 'shield_wall',
    name: 'Shield Wall',
    icon: 'Shield',
    aim: 'self',
    cooldownMs: 12000,
    manaCost: 40,
    castTimeMs: 0,
    range: 0,
    damage: 0,
    effects: [{ type: 'shield', amount: 60, durationMs: 5000 }],
  },
  ground_slam: {
    id: 'ground_slam',
    name: 'Ground Slam',
    icon: 'Bomb',
    aim: 'self',
    cooldownMs: 14000,
    manaCost: 60,
    castTimeMs: 400,
    range: 5,
    damage: 60,
    aoeRadius: 5,
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 5,
        onHit: [
          { type: 'damage', amount: 60 },
          { type: 'knockback', distance: 4, speed: 24 },
        ],
      },
    ],
  },

  // === Archer — kiting skirmisher: pokes, slows, a mobility burst, a long root ===
  power_shot: {
    id: 'power_shot',
    name: 'Power Shot',
    icon: 'Crosshair',
    aim: 'direction',
    cooldownMs: 2000,
    manaCost: 18,
    castTimeMs: 0,
    range: 32,
    damage: 28,
    projectileSpeed: 30,
    projectileRange: 26,
    projectileRadius: 0.5,
    effects: [
      {
        type: 'projectile',
        speed: 30,
        range: 26,
        radius: 0.5,
        vfx: 'power_shot',
        onHit: [{ type: 'damage', amount: 28 }],
      },
    ],
  },
  crippling_shot: {
    id: 'crippling_shot',
    name: 'Crippling Shot',
    icon: 'Snail',
    aim: 'direction',
    cooldownMs: 6000,
    manaCost: 25,
    castTimeMs: 0,
    range: 30,
    damage: 16,
    projectileSpeed: 28,
    projectileRange: 24,
    projectileRadius: 0.5,
    effects: [
      {
        type: 'projectile',
        speed: 28,
        range: 24,
        radius: 0.5,
        vfx: 'crippling_shot',
        onHit: [
          { type: 'damage', amount: 16 },
          { type: 'status', status: { kind: 'slow', durationMs: 2500, magnitude: 0.45 } },
        ],
      },
    ],
  },
  tumble: {
    id: 'tumble',
    name: 'Tumble',
    icon: 'Footprints',
    aim: 'direction',
    cooldownMs: 8000,
    manaCost: 30,
    castTimeMs: 0,
    range: 8,
    damage: 0,
    effects: [
      { type: 'dash', distance: 8, speed: 28 },
      // Self-buffs: a leaf applied with a non-unit aim lands on the caster.
      { type: 'status', status: { kind: 'haste', durationMs: 3000, magnitude: 1.3 } },
      { type: 'status', status: { kind: 'attack_speed', durationMs: 3000, magnitude: 1.5 } },
    ],
  },
  pinning_arrow: {
    id: 'pinning_arrow',
    name: 'Pinning Arrow',
    icon: 'Target',
    aim: 'direction',
    cooldownMs: 14000,
    manaCost: 45,
    castTimeMs: 0,
    range: 34,
    damage: 30,
    projectileSpeed: 34,
    projectileRange: 28,
    projectileRadius: 0.5,
    effects: [
      {
        type: 'projectile',
        speed: 34,
        range: 28,
        radius: 0.5,
        vfx: 'pinning_arrow',
        onHit: [
          { type: 'damage', amount: 30 },
          { type: 'status', status: { kind: 'root', durationMs: 1500 } },
        ],
      },
    ],
  },

  // === Priest — support: a silencing smite, self-heal, an ally HoT, a targeted stun ===
  smite: {
    id: 'smite',
    name: 'Smite',
    icon: 'Sun',
    aim: 'direction',
    cooldownMs: 5000,
    manaCost: 25,
    castTimeMs: 0,
    range: 28,
    damage: 22,
    projectileSpeed: 26,
    projectileRange: 22,
    projectileRadius: 0.7,
    effects: [
      {
        type: 'projectile',
        speed: 26,
        range: 22,
        radius: 0.7,
        vfx: 'holy_bolt',
        onHit: [
          { type: 'damage', amount: 22 },
          { type: 'status', status: { kind: 'silence', durationMs: 1500 } },
        ],
      },
    ],
  },
  heal: {
    id: 'heal',
    name: 'Heal',
    icon: 'HeartPulse',
    aim: 'self',
    cooldownMs: 10000,
    manaCost: 40,
    castTimeMs: 600,
    range: 0,
    damage: 0,
    healAmount: 40,
    effects: [{ type: 'heal', amount: 40 }],
  },
  renew: {
    id: 'renew',
    name: 'Renew',
    icon: 'Heart',
    aim: 'unit',
    cooldownMs: 8000,
    manaCost: 35,
    castTimeMs: 0,
    range: 20,
    damage: 0,
    effects: [
      // Heal-over-time on the locked target (falls back to self if none locked).
      { type: 'status', status: { kind: 'hot', durationMs: 5000, tickMs: 1000, tickAmount: 12 } },
    ],
  },
  condemn: {
    id: 'condemn',
    name: 'Condemn',
    icon: 'Skull',
    aim: 'unit',
    cooldownMs: 15000,
    manaCost: 50,
    castTimeMs: 0,
    range: 18,
    damage: 35,
    effects: [
      // A targeted nuke + hard stun — the showcase for unit-targeted CC.
      { type: 'damage', amount: 35 },
      { type: 'status', status: { kind: 'stun', durationMs: 1500 } },
    ],
  },
} satisfies Record<string, AbilityDef>;

/** Every ability id known to the game (the registry keys, as a literal union). */
export type AbilityId = keyof typeof ABILITY_REGISTRY;

/** Back-compat alias — the rest of the codebase still says `AbilityKind`. */
export type AbilityKind = AbilityId;

/** All ability ids, for iteration/validation. */
export const ABILITY_KINDS = Object.keys(ABILITY_REGISTRY) as AbilityKind[];

/**
 * The canonical config map, keyed by id. Identical object to
 * {@link ABILITY_REGISTRY}; typed as the catalog so legacy consumers that read
 * the flat {@link AbilityConfig} fields (`ABILITIES[kind].cooldownMs`, …) and the
 * executor that reads `.effects` share one source of truth.
 */
export const ABILITIES: Record<AbilityKind, AbilityDef> = ABILITY_REGISTRY;

/** Runtime guard: is `value` a known ability id? */
export function isAbilityKind(value: unknown): value is AbilityKind {
  return typeof value === 'string' && value in ABILITY_REGISTRY;
}

// ---------------------------------------------------------------------------
// Ability slots & per-class loadouts — the QWER input contract.
// ---------------------------------------------------------------------------

/** The four MOBA ability input slots. */
export type AbilitySlot = 'Q' | 'W' | 'E' | 'R';

export const ABILITY_SLOTS: readonly AbilitySlot[] = ['Q', 'W', 'E', 'R'];

/**
 * Which ability each class binds to each QWER slot. Adding/retheming a class kit
 * is a single edit here — every consumer (input, action bar, character select,
 * server resolution) is driven off this map.
 */
export const CLASS_LOADOUTS: Record<CharacterClass, Partial<Record<AbilitySlot, AbilityKind>>> = {
  warrior: { Q: 'cleave', W: 'charge', E: 'shield_wall', R: 'ground_slam' },
  mage: { Q: 'fireball', W: 'frost_nova', E: 'arcane_bolt', R: 'arcane_blast' },
  archer: { Q: 'power_shot', W: 'crippling_shot', E: 'tumble', R: 'pinning_arrow' },
  priest: { Q: 'smite', W: 'heal', E: 'renew', R: 'condemn' },
};
