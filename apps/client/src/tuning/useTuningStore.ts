import { create } from 'zustand';
import { defaultTuning, type AbilityId, type AbilityTuning, type Tuning } from './defaults';

interface TuningStore {
  /** Current tuning values (start at defaults; the dev panel edits them). */
  values: Tuning;
  /** Patch a flat section (player/combat/arena/camera/ai). */
  setSection: <K extends keyof Tuning>(section: K, patch: Partial<Tuning[K]>) => void;
  /** Patch a single ability's tuning. */
  setAbility: (id: AbilityId, patch: Partial<AbilityTuning>) => void;
  /** Restore all values to defaults. */
  reset: () => void;
}

/**
 * Holds the live tuning values. Always present (no Leva dependency). Systems
 * read from here; the dev-only Leva panels are the only writers.
 */
export const useTuningStore = create<TuningStore>((set) => ({
  values: structuredClone(defaultTuning),

  setSection: (section, patch) =>
    set((s) => ({ values: { ...s.values, [section]: { ...s.values[section], ...patch } } })),

  setAbility: (id, patch) =>
    set((s) => ({
      values: {
        ...s.values,
        abilities: { ...s.values.abilities, [id]: { ...s.values.abilities[id], ...patch } },
      },
    })),

  reset: () => set({ values: structuredClone(defaultTuning) }),
}));

/**
 * Reactive selector for components — re-renders when the selected slice changes.
 * Use in React components (e.g. to feed props that should update live).
 */
export function useTuning<T>(selector: (values: Tuning) => T): T {
  return useTuningStore((s) => selector(s.values));
}

/**
 * Non-reactive snapshot for hot paths — read inside `useFrame` so live edits
 * apply without triggering React re-renders.
 */
export const getTuning = (): Tuning => useTuningStore.getState().values;
