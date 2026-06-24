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
    projectileSpeed: 45,
    projectileRange: 30,
    projectileRadius: 1,
    effects: [
      {
        type: 'projectile',
        speed: 45,
        range: 30,
        radius: 1,
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
    // A long-range, fast "sniper" bolt that punches clean through enemies.
    projectileSpeed: 65,
    projectileRange: 50,
    projectileRadius: 0.6,
    effects: [
      {
        type: 'projectile',
        speed: 65,
        range: 50,
        radius: 0.6,
        vfx: VFX_ARCANE,
        onHit: [{ type: 'damage', amount: 30 }],
        // Pierces every enemy it passes through (damaging each once); only cover
        // and objects stop it — no enemy-count cap.
        pierce: true,
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
    castTimeMs: 0,
    range: 16,
    damage: 65,
    aoeRadius: 4,
    effects: [
      {
        type: 'aoe',
        at: 'point',
        radius: 4,
        onHit: [{ type: 'damage', amount: 65 }],
      },
    ],
  },

  // === Warrior — durable bruiser: melee AoE + bleed, gap-close, shield, slam ult ===
  cleave: {
    id: 'cleave',
    name: 'Cleave',
    icon: 'Swords',
    aim: 'self',
    cooldownMs: 1000,
    manaCost: 10,
    castTimeMs: 0,
    range: 4,
    damage: 25,
    aoeRadius: 4,
    // A 180° swing in front of the warrior (its current facing); instant on press,
    // no aim indicator. Flat hit, no bleed.
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 4,
        arc: 180,
        onHit: [{ type: 'damage', amount: 25 }],
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
    cooldownMs: 5000,
    manaCost: 20,
    castTimeMs: 0,
    range: 12,
    damage: 10,
    // A fast gap-closing lunge that hits anything it ploughs through for 10.
    effects: [{ type: 'dash', distance: 12, speed: 34, damage: 10 }],
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
    castTimeMs: 0,
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

  // === Archer — kiting skirmisher: a rapid triple-shot, a stun bomb, an
  // empowering roll, and a long-range sniper finisher ===
  power_shot: {
    id: 'power_shot',
    name: 'Power Shot',
    icon: 'Crosshair',
    aim: 'direction',
    cooldownMs: 2000,
    manaCost: 20,
    castTimeMs: 0,
    range: 36,
    damage: 12,
    projectileSpeed: 40,
    projectileRange: 36,
    projectileRadius: 0.6,
    effects: [
      {
        type: 'projectile',
        speed: 40,
        range: 36,
        radius: 0.6,
        vfx: 'power_shot',
        onHit: [{ type: 'damage', amount: 12 }],
        // Fires 3 arrows in a row, 0.2s apart.
        count: 3,
        intervalMs: 200,
      },
    ],
  },
  crippling_shot: {
    id: 'crippling_shot',
    name: 'Concussive Shot',
    icon: 'Zap',
    aim: 'point',
    cooldownMs: 7000,
    manaCost: 40,
    castTimeMs: 0,
    range: 8,
    damage: 5,
    aoeRadius: 4,
    effects: [
      {
        type: 'aoe',
        at: 'point',
        radius: 4,
        onHit: [
          { type: 'damage', amount: 5 },
          { type: 'status', status: { kind: 'stun', durationMs: 2000 } },
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
    range: 5,
    damage: 0,
    effects: [
      { type: 'dash', distance: 5, speed: 28 },
      // Self-buff (a leaf with a non-unit aim lands on the caster): the next
      // ability or projectile that connects deals +10 damage, then consumed.
      { type: 'status', status: { kind: 'empower', durationMs: 6000, magnitude: 10 } },
    ],
  },
  pinning_arrow: {
    id: 'pinning_arrow',
    name: 'Sniper Shot',
    icon: 'Target',
    aim: 'direction',
    cooldownMs: 12000,
    manaCost: 60,
    castTimeMs: 0,
    range: 65,
    damage: 80,
    projectileSpeed: 85,
    projectileRange: 65,
    projectileRadius: 0.6,
    effects: [
      {
        type: 'projectile',
        speed: 85,
        range: 65,
        radius: 0.6,
        vfx: 'pinning_arrow',
        onHit: [{ type: 'damage', amount: 80 }],
        // Piercing: damages each enemy it passes through, only stopping on cover.
        pierce: true,
      },
    ],
  },

  // === Priest — support: a hit+heal burst, a damaging field, a shield/empower, a beam ===
  // Q — Smite: a ground burst that damages enemies + objects and heals the priest
  // and nearby allies.
  smite: {
    id: 'smite',
    name: 'Smite',
    icon: 'Sun',
    aim: 'point',
    cooldownMs: 2000,
    manaCost: 30,
    castTimeMs: 0,
    range: 16,
    damage: 26,
    aoeRadius: 2,
    effects: [
      { type: 'aoe', at: 'point', radius: 2, onHit: [{ type: 'damage', amount: 26 }] },
    ],
  },
  // W — Sanctuary: a damaging field that follows the priest for 3s.
  heal: {
    id: 'heal',
    name: 'Sanctuary',
    icon: 'Waves',
    aim: 'self',
    cooldownMs: 10000,
    manaCost: 60,
    castTimeMs: 0,
    range: 8,
    damage: 6,
    aoeRadius: 8,
    effects: [
      // A self `field` status: ticks 6 to enemies within radius 8 every 0.5s for 3s.
      { type: 'status', status: { kind: 'field', durationMs: 3000, tickMs: 500, tickAmount: 6, magnitude: 8 } },
    ],
  },
  // E — Blessing: a shield, plus +20 damage on the priest's NEXT Smite (Q only).
  renew: {
    id: 'renew',
    name: 'Blessing',
    icon: 'Shield',
    aim: 'self',
    cooldownMs: 8000,
    manaCost: 40,
    castTimeMs: 0,
    range: 0,
    damage: 0,
    effects: [
      { type: 'shield', amount: 20, durationMs: 6000 },
      { type: 'status', status: { kind: 'empower', durationMs: 6000, magnitude: 20, ability: 'smite' } },
    ],
  },
  condemn: {
    id: 'condemn',
    name: 'Judgment',
    icon: 'Sun',
    aim: 'direction',
    cooldownMs: 12000,
    manaCost: 100,
    castTimeMs: 0,
    range: 18,
    damage: 6,
    // A sustained beam: an 18-long, 1-wide ray that deals 6 damage every 0.2s for
    // 3s (a target is hit the instant it enters, then each tick). The priest may
    // move and re-aim with the mouse while channelling, but can't cast anything
    // else; re-pressing R interrupts it. Handled by the server's channel system
    // (not the instant effect executor), so no `effects`.
    channelMs: 3000,
    channelTickMs: 200,
    beamWidth: 1,
    effects: [],
  },

  // === Ninja — high-mobility melee assassin kit ===
  ninja_q: {
    id: 'ninja_q',
    name: 'Katana Slash',
    icon: 'Swords',
    aim: 'self',
    cooldownMs: 1000,
    manaCost: 10,
    castTimeMs: 0,
    range: 4,
    damage: 25,
    aoeRadius: 4,
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 4,
        arc: 120,
        onHit: [{ type: 'damage', amount: 25 }],
      },
    ],
  },
  ninja_w: {
    id: 'ninja_w',
    name: 'Shuriken Showdown',
    icon: 'Zap',
    aim: 'direction',
    cooldownMs: 8000,
    manaCost: 40,
    castTimeMs: 0,
    range: 30,
    damage: 35,
    projectileSpeed: 55,
    projectileRange: 30,
    projectileRadius: 0.8,
    effects: [
      {
        type: 'projectile',
        speed: 55,
        range: 30,
        radius: 0.8,
        vfx: 'shuriken',
        onHit: [{ type: 'damage', amount: 35 }],
        pierce: true,
      },
    ],
  },
  ninja_e: {
    id: 'ninja_e',
    name: 'Shadow Dash',
    icon: 'Wind',
    aim: 'direction',
    cooldownMs: 3000,
    manaCost: 20,
    castTimeMs: 0,
    range: 6,
    damage: 0,
    effects: [
      {
        type: 'dash',
        distance: 6,
        speed: 32,
      },
    ],
  },
  ninja_r: {
    id: 'ninja_r',
    name: 'Smoke Teleport',
    icon: 'Bomb',
    aim: 'point',
    cooldownMs: 10000,
    manaCost: 60,
    castTimeMs: 0,
    range: 10,
    damage: 35,
    aoeRadius: 3,
    effects: [
      {
        type: 'aoe',
        at: 'caster',
        radius: 3,
        onHit: [
          { type: 'damage', amount: 35 },
          { type: 'status', status: { kind: 'blind', durationMs: 1500 } },
        ],
      },
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
  ninja: { Q: 'ninja_q', W: 'ninja_w', E: 'ninja_e', R: 'ninja_r' },
};
