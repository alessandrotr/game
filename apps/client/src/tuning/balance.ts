/**
 * Client balance model. The canonical gameplay values live in `@arena/shared`
 * (movement feel, per-class stats, ability base + per-class overrides). The dev
 * tools edit a thin OVERRIDE DIFF on top; effective = canonical ⊕ overrides.
 *
 * Camera is the one client-only section (no server equivalent), so its defaults
 * and meta live here rather than in shared.
 */

import {
  ABILITIES,
  CLASS_ABILITY_OVERRIDES,
  CLASS_DEFINITIONS,
  MOVEMENT,
  type AbilityConfig,
  type AbilityKind,
  type CharacterClass,
  type ClassStats,
  type FieldMeta,
  type MovementConfig,
} from '@arena/shared';

/** Camera follow tuning — client-only (never sent to the server). */
export interface CameraConfig {
  distance: number;
  height: number;
  followSmoothing: number;
}

export const CAMERA: CameraConfig = { distance: 13.4, height: 11.0, followSmoothing: 30 };

export const CAMERA_FIELD_META = {
  distance: { min: 2, max: 30, step: 0.1, label: 'Distance / Zoom' },
  height: { min: 0, max: 30, step: 0.1, label: 'Height / Angle' },
  followSmoothing: { min: 0.5, max: 30, step: 0.1, label: 'Follow Smoothing' },
} satisfies Record<keyof CameraConfig, FieldMeta>;

/** The override diff edited by the dev tools and persisted to localStorage. */
export interface BalanceOverrides {
  movement?: Partial<MovementConfig>;
  camera?: Partial<CameraConfig>;
  classStats?: Partial<Record<CharacterClass, Partial<ClassStats>>>;
  /** Global ability base patches. */
  abilityBase?: Partial<Record<AbilityKind, Partial<AbilityConfig>>>;
  /** Per-class ability deltas over the (already overridden) base. */
  classAbilities?: Partial<
    Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>
  >;
}

const merge = <T extends object>(base: T, patch?: Partial<T>): T =>
  patch ? { ...base, ...patch } : base;

// --- Effective value resolvers (canonical ⊕ override) ---

export const effectiveMovement = (ov: BalanceOverrides): MovementConfig =>
  merge(MOVEMENT, ov.movement);

export const effectiveCamera = (ov: BalanceOverrides): CameraConfig => merge(CAMERA, ov.camera);

export const effectiveClassStats = (ov: BalanceOverrides, c: CharacterClass): ClassStats =>
  merge(CLASS_DEFINITIONS[c].stats, ov.classStats?.[c]);

export const effectiveAbilityBase = (ov: BalanceOverrides, k: AbilityKind): AbilityConfig =>
  merge(ABILITIES[k], ov.abilityBase?.[k]);

export const effectiveAbilityForClass = (
  ov: BalanceOverrides,
  c: CharacterClass,
  k: AbilityKind,
): AbilityConfig => merge(effectiveAbilityBase(ov, k), ov.classAbilities?.[c]?.[k]);

/**
 * Local-player movement for client-side prediction: the per-class move speed
 * (single speed, LoL-style) plus the shared feel fields. Feeds the shared
 * `stepLocomotion` so prediction matches the server exactly.
 */
export interface LocalMovement {
  speed: number;
  jumpForce: number;
  rotationSpeed: number;
  stoppingDistance: number;
}

export function localMovement(ov: BalanceOverrides, c: CharacterClass): LocalMovement {
  const m = effectiveMovement(ov);
  return {
    speed: effectiveClassStats(ov, c).moveSpeed,
    jumpForce: m.jumpForce,
    rotationSpeed: m.rotationSpeed,
    stoppingDistance: m.stoppingDistance,
  };
}

/**
 * A paste-ready snapshot of the current EFFECTIVE balance, for committing a
 * tuning pass back into the canonical shared files. Only non-empty sections are
 * emitted (movement feel, per-class stat deltas, ability base/per-class deltas).
 */
export function exportBalance(ov: BalanceOverrides): string {
  const allClasses = Object.keys(CLASS_DEFINITIONS) as CharacterClass[];
  const snapshot = {
    MOVEMENT: effectiveMovement(ov),
    CLASS_STATS: Object.fromEntries(allClasses.map((c) => [c, effectiveClassStats(ov, c)])),
    ABILITY_BASE_OVERRIDES: ov.abilityBase ?? {},
    CLASS_ABILITY_OVERRIDES: ov.classAbilities ?? CLASS_ABILITY_OVERRIDES,
  };
  return JSON.stringify(snapshot, null, 2);
}
