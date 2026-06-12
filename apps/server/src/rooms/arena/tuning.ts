import {
  ABILITIES,
  ABILITY_FIELD_META,
  CLASS_ABILITY_OVERRIDES,
  CLASS_DEFINITIONS,
  CLASS_STAT_FIELD_META,
  MOVEMENT,
  MOVEMENT_FIELD_META,
  isAbilityKind,
  isCharacterClass,
  type AbilityConfig,
  type AbilityDef,
  type AbilityKind,
  type CharacterClass,
  type ClassStats,
  type ClientMessagePayloads,
  type ClientMessage,
  type FieldMeta,
  type MovementConfig,
} from '@arena/shared';
import { clamp } from '../util/locomotion.js';

/**
 * The authoritative, live-tunable balance for a single arena room. Seeded from
 * the shared canonical values via `structuredClone` so dev-tuning one room never
 * leaks into another (or into the shared defaults). Owns the merge/validation
 * path for every dev-tune message and the lookups the simulation needs
 * (`abilityFor`, `walkSpeedFor`).
 *
 *  - `movement`: global movement "feel" (per-class walk speed is `classStats`).
 *  - `classStats`: per-class HP / mana / move speed / attack.
 *  - `abilityBase`: the global ability defaults.
 *  - `classAbilityOverrides`: per-class deltas over the base.
 */
export class ArenaTuning {
  readonly movement: MovementConfig = structuredClone(MOVEMENT);
  readonly classStats: Record<CharacterClass, ClassStats> = structuredClone(
    Object.fromEntries(
      (Object.keys(CLASS_DEFINITIONS) as CharacterClass[]).map((c) => [
        c,
        CLASS_DEFINITIONS[c].stats,
      ]),
    ),
  ) as Record<CharacterClass, ClassStats>;
  readonly abilityBase: Record<AbilityKind, AbilityDef> = structuredClone(ABILITIES);
  readonly classAbilityOverrides: Partial<
    Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>
  > = structuredClone(CLASS_ABILITY_OVERRIDES);

  /** The effective ability definition for a class = global base ⊕ that class's
   *  override (tuning only patches the flat numeric fields; `effects` carry over). */
  abilityFor(characterClass: string, kind: AbilityKind): AbilityDef {
    const override = this.classAbilityOverrides[characterClass as CharacterClass]?.[kind];
    return override ? { ...this.abilityBase[kind], ...override } : this.abilityBase[kind];
  }

  /** Per-player walk speed (the class move-speed stat). Class is validated on
   *  join, so the fallback only guards against an unexpected/blank class. */
  walkSpeedFor(characterClass: string): number {
    return (
      this.classStats[characterClass as CharacterClass]?.moveSpeed ??
      CLASS_DEFINITIONS.warrior.stats.moveSpeed
    );
  }

  /** Apply a movement-feel patch (the `DevTune` message). */
  tuneMovement(patch: Record<string, unknown>): void {
    this.mergeTuned(this.movement as unknown as Record<string, number>, patch, MOVEMENT_FIELD_META);
  }

  /** Apply an ability patch: global base patches and per-class delta patches
   *  (the `AbilityTune` message). */
  tuneAbilities(message: ClientMessagePayloads[ClientMessage.AbilityTune]): void {
    if (!message || typeof message !== 'object') return;
    for (const [kind, overrides] of Object.entries(message.global ?? {})) {
      if (!isAbilityKind(kind)) continue;
      this.mergeTuned(
        this.abilityBase[kind] as unknown as Record<string, number>,
        overrides as Record<string, unknown>,
        ABILITY_FIELD_META,
      );
    }
    for (const [cls, byKind] of Object.entries(message.perClass ?? {})) {
      if (!isCharacterClass(cls) || !byKind) continue;
      const classOverrides = (this.classAbilityOverrides[cls] ??= {});
      for (const [kind, overrides] of Object.entries(byKind)) {
        if (!isAbilityKind(kind)) continue;
        const slot = (classOverrides[kind] ??= {});
        this.mergeTuned(
          slot as Record<string, number>,
          overrides as Record<string, unknown>,
          ABILITY_FIELD_META,
        );
      }
    }
  }

  /** Apply per-class stat patches (the `StatTune` message). */
  tuneStats(message: ClientMessagePayloads[ClientMessage.StatTune]): void {
    if (!message || typeof message !== 'object') return;
    for (const [cls, patch] of Object.entries(message)) {
      if (!isCharacterClass(cls)) continue;
      this.mergeTuned(
        this.classStats[cls] as unknown as Record<string, number>,
        patch as Record<string, unknown>,
        CLASS_STAT_FIELD_META,
      );
    }
  }

  /**
   * Merge a numeric override patch into a target, clamping each field to its
   * meta range and ignoring unknown/non-numeric fields — the single validation
   * path for every dev-tune message (ranges come from the shared field meta).
   */
  private mergeTuned(
    target: Record<string, number>,
    patch: Record<string, unknown> | undefined,
    meta: Partial<Record<string, FieldMeta>>,
  ): void {
    if (!patch || typeof patch !== 'object') return;
    for (const [field, value] of Object.entries(patch)) {
      const m = meta[field];
      if (m && typeof value === 'number' && Number.isFinite(value)) {
        target[field] = clamp(value, m.min, m.max);
      }
    }
  }
}
