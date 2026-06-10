import { create } from 'zustand';
import type { AbilityKind } from '@arena/shared';

/**
 * Ground-targeting mode for ground-targeted abilities (e.g. the mage's Arcane
 * Blast). While `pending` is set, the cursor shows an AoE indicator and the next
 * left-click on the ground casts at that point; right-click / Esc / pressing the
 * same key again cancels.
 */
interface AbilityTargetingStore {
  pending: AbilityKind | null;
  begin: (ability: AbilityKind) => void;
  cancel: () => void;
}

export const useAbilityTargeting = create<AbilityTargetingStore>((set) => ({
  pending: null,
  begin: (ability) => set({ pending: ability }),
  cancel: () => set((s) => (s.pending === null ? s : { pending: null })),
}));
