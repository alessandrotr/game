import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AbilityConfig, AbilityKind, CharacterClass, ClassStats, MovementConfig } from '@arena/shared';
import {
  effectiveCamera,
  effectiveMovement,
  exportBalance,
  localMovement,
  type BalanceOverrides,
  type CameraConfig,
  type LocalMovement,
} from './balance';

interface TuningStore {
  /** The override diff over the shared canonical balance (persisted). */
  overrides: BalanceOverrides;
  setMovement: (patch: Partial<MovementConfig>) => void;
  setCamera: (patch: Partial<CameraConfig>) => void;
  setClassStat: (c: CharacterClass, patch: Partial<ClassStats>) => void;
  setAbilityBase: (k: AbilityKind, patch: Partial<AbilityConfig>) => void;
  setClassAbility: (c: CharacterClass, k: AbilityKind, patch: Partial<AbilityConfig>) => void;
  /** Clear all overrides (back to shared canonical defaults). */
  reset: () => void;
}

/**
 * Live tuning overrides. Always present (no Leva dependency) and persisted to
 * localStorage so a balancing session survives a reload. Gameplay/render read
 * the effective values via the resolvers below; the dev panels are the writers.
 */
export const useTuningStore = create<TuningStore>()(
  persist(
    (set) => ({
      overrides: {},

      setMovement: (patch) =>
        set((s) => ({ overrides: { ...s.overrides, movement: { ...s.overrides.movement, ...patch } } })),

      setCamera: (patch) =>
        set((s) => ({ overrides: { ...s.overrides, camera: { ...s.overrides.camera, ...patch } } })),

      setClassStat: (c, patch) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            classStats: { ...s.overrides.classStats, [c]: { ...s.overrides.classStats?.[c], ...patch } },
          },
        })),

      setAbilityBase: (k, patch) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            abilityBase: { ...s.overrides.abilityBase, [k]: { ...s.overrides.abilityBase?.[k], ...patch } },
          },
        })),

      setClassAbility: (c, k, patch) =>
        set((s) => {
          const forClass = s.overrides.classAbilities?.[c];
          return {
            overrides: {
              ...s.overrides,
              classAbilities: {
                ...s.overrides.classAbilities,
                [c]: { ...forClass, [k]: { ...forClass?.[k], ...patch } },
              },
            },
          };
        }),

      reset: () => set({ overrides: {} }),
    }),
    { name: 'arena.balance.overrides' },
  ),
);

// --- Effective-value accessors (canonical ⊕ overrides) ---

/** Non-reactive snapshot of the local-player movement, for `useFrame` hot paths. */
export const getLocalMovement = (c: CharacterClass): LocalMovement =>
  localMovement(useTuningStore.getState().overrides, c);

/** Non-reactive movement feel (sprint threshold, etc.). */
export const getMovementFeel = (): MovementConfig => effectiveMovement(useTuningStore.getState().overrides);

/** Non-reactive camera snapshot. */
export const getCamera = (): CameraConfig => effectiveCamera(useTuningStore.getState().overrides);

/** Reactive selector over the override diff (for panels / the export button). */
export function useOverrides<T>(selector: (o: BalanceOverrides) => T): T {
  return useTuningStore((s) => selector(s.overrides));
}

/** The current effective balance as a paste-ready snapshot string. */
export const getExportedBalance = (): string => exportBalance(useTuningStore.getState().overrides);
