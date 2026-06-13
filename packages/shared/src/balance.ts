/**
 * Balance metadata, per-class resolution + validation — the layer that lets ONE
 * set of canonical gameplay values drive the server sim, the client display,
 * AND the dev-tools tuning sliders.
 *
 * Per-class model:
 *  - Class stats (HP / mana / move speed / attack) live in `CLASS_DEFINITIONS`
 *    and are authoritative in the sim.
 *  - Abilities have a global base (`ABILITIES`) plus optional per-class overrides
 *    (`CLASS_ABILITY_OVERRIDES`); the effective config for a (class, ability) is
 *    `getAbilityConfig()` = base ⊕ override. So a class can hit harder with the
 *    same ability without duplicating its whole config.
 *  - Movement "feel" (sprint multiplier, jump, turn, stop, sprint threshold) is
 *    global; per-class walk speed comes from the class `moveSpeed` stat.
 *
 * `*_FIELD_META` declares each tunable field's range/step/label/unit ONCE — the
 * Leva panels build controls from it and the server clamps overrides against the
 * same min/max. zod schemas validate the canonical values (and overrides) against
 * those ranges; `validateBalance()` runs at load to fail fast on a bad commit.
 *
 * Time stays in milliseconds end-to-end; a field whose `display` is `'seconds'`
 * is only *shown* in seconds by the UI.
 */

import { z } from 'zod';
import type { CharacterClass } from './assets.js';
import {
  ABILITIES,
  ABILITY_KINDS,
  CLICK_STOPPING_DISTANCE,
  JUMP_FORCE,
  type AbilityConfig,
  type AbilityKind,
} from './constants.js';
import { CLASS_LIST, type ClassStats } from './classes.js';

/** Tuning metadata for one numeric field — the single home for its valid range. */
export interface FieldMeta {
  min: number;
  max: number;
  step: number;
  label: string;
  /** Show/edit in seconds while the stored value stays in milliseconds. */
  display?: 'seconds';
}

// ---------------------------------------------------------------------------
// Movement "feel" (global). Per-class walk speed comes from the class stat.
// ---------------------------------------------------------------------------

export interface MovementConfig {
  jumpForce: number;
  /** Turn rate toward the travel direction (1/second) — high = snappy LoL-style. */
  rotationSpeed: number;
  stoppingDistance: number;
}

export const MOVEMENT: MovementConfig = {
  jumpForce: JUMP_FORCE,
  rotationSpeed: 28,
  stoppingDistance: CLICK_STOPPING_DISTANCE,
};

export const MOVEMENT_FIELD_META = {
  jumpForce: { min: 0, max: 40, step: 0.1, label: 'Jump Force' },
  rotationSpeed: { min: 0, max: 40, step: 0.5, label: 'Rotation Speed' },
  stoppingDistance: { min: 0, max: 5, step: 0.05, label: 'Stopping Distance' },
} satisfies Record<keyof MovementConfig, FieldMeta>;

// ---------------------------------------------------------------------------
// Per-class stats (authoritative). Tunable fields only; `difficulty` is UI.
// ---------------------------------------------------------------------------

export const CLASS_STAT_FIELD_META = {
  health: { min: 1, max: 500, step: 5, label: 'Health' },
  mana: { min: 0, max: 400, step: 5, label: 'Mana' },
  moveSpeed: { min: 0, max: 20, step: 0.1, label: 'Move Speed' },
  attackDamage: { min: 0, max: 200, step: 1, label: 'Attack Damage' },
} satisfies Partial<Record<keyof ClassStats, FieldMeta>>;

export type TunableStatField = keyof typeof CLASS_STAT_FIELD_META;

// ---------------------------------------------------------------------------
// Abilities: global base ⊕ per-class overrides.
// ---------------------------------------------------------------------------

export const ABILITY_FIELD_META = {
  cooldownMs: { min: 0, max: 30_000, step: 100, label: 'Cooldown', display: 'seconds' },
  manaCost: { min: 0, max: 200, step: 1, label: 'Mana Cost' },
  castTimeMs: { min: 0, max: 5_000, step: 50, label: 'Cast Time', display: 'seconds' },
  range: { min: 0, max: 70, step: 0.5, label: 'Range' },
  damage: { min: 0, max: 200, step: 1, label: 'Damage' },
  projectileSpeed: { min: 0, max: 90, step: 0.5, label: 'Projectile Speed' },
  projectileRange: { min: 0, max: 70, step: 0.5, label: 'Projectile Range' },
  projectileRadius: { min: 0, max: 3, step: 0.05, label: 'Projectile Radius' },
  healAmount: { min: 0, max: 200, step: 1, label: 'Heal Amount' },
  aoeRadius: { min: 0, max: 15, step: 0.1, label: 'AoE Radius' },
} satisfies Partial<Record<keyof AbilityConfig, FieldMeta>>;

export type TunableAbilityField = keyof typeof ABILITY_FIELD_META;

/**
 * Per-class deltas over the global ability base. Empty by default — add only the
 * fields a class should differ on, e.g. `mage: { fireball: { damage: 36 } }`.
 * The dev tools edit this live; export commits it back here.
 */
export const CLASS_ABILITY_OVERRIDES: Partial<
  Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>
> = {};

/** The effective ability config for a class = global base ⊕ that class's override. */
export function getAbilityConfig(characterClass: CharacterClass, kind: AbilityKind): AbilityConfig {
  const override = CLASS_ABILITY_OVERRIDES[characterClass]?.[kind];
  return override ? { ...ABILITIES[kind], ...override } : ABILITIES[kind];
}

// ---------------------------------------------------------------------------
// zod schemas (ranges drawn from the field meta) + load-time validation.
// ---------------------------------------------------------------------------

const num = (m: FieldMeta) => z.number().min(m.min).max(m.max);

export const abilityConfigSchema = z
  .object({
    cooldownMs: num(ABILITY_FIELD_META.cooldownMs),
    manaCost: num(ABILITY_FIELD_META.manaCost),
    castTimeMs: num(ABILITY_FIELD_META.castTimeMs),
    range: num(ABILITY_FIELD_META.range),
    damage: num(ABILITY_FIELD_META.damage),
    projectileSpeed: num(ABILITY_FIELD_META.projectileSpeed).optional(),
    projectileRange: num(ABILITY_FIELD_META.projectileRange).optional(),
    projectileRadius: num(ABILITY_FIELD_META.projectileRadius).optional(),
    healAmount: num(ABILITY_FIELD_META.healAmount).optional(),
    aoeRadius: num(ABILITY_FIELD_META.aoeRadius).optional(),
    aim: z.enum(['self', 'direction', 'point', 'unit']).optional(),
  })
  // passthrough (not strict): an `AbilityDef` also carries id/name/icon/effects;
  // this schema validates only the tunable flat fields and ignores the rest.
  .passthrough();

/** A partial ability config — for per-class overrides and live tuning patches. */
export const abilityOverrideSchema = abilityConfigSchema.partial();

export const movementSchema = z
  .object({
    jumpForce: num(MOVEMENT_FIELD_META.jumpForce),
    rotationSpeed: num(MOVEMENT_FIELD_META.rotationSpeed),
    stoppingDistance: num(MOVEMENT_FIELD_META.stoppingDistance),
  })
  .strict();

export const classStatsSchema = z
  .object({
    health: num(CLASS_STAT_FIELD_META.health),
    mana: num(CLASS_STAT_FIELD_META.mana),
    moveSpeed: num(CLASS_STAT_FIELD_META.moveSpeed),
    attackDamage: num(CLASS_STAT_FIELD_META.attackDamage),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

/** A partial class-stats patch — for live tuning. */
export const classStatsOverrideSchema = classStatsSchema.partial();

/**
 * Validate every canonical value against its schema. Runs once at load so an
 * out-of-range value (or a typo in a committed override) fails fast rather than
 * shipping. Throws a zod error naming the offending path.
 */
export function validateBalance(): void {
  for (const kind of ABILITY_KINDS) {
    abilityConfigSchema.parse(ABILITIES[kind]);
  }
  movementSchema.parse(MOVEMENT);
  for (const def of CLASS_LIST) {
    classStatsSchema.parse(def.stats);
  }
  for (const [, byKind] of Object.entries(CLASS_ABILITY_OVERRIDES)) {
    for (const override of Object.values(byKind ?? {})) {
      abilityOverrideSchema.parse(override);
    }
  }
}

validateBalance();
