import { create } from 'zustand';
import type { CosmeticRarity } from '@arena/shared';

/** A queued "you unlocked X" toast. */
export interface UnlockToast {
  id: number;
  name: string;
  rarity: CosmeticRarity;
}

/**
 * Transient feedback for claiming a cosmetic in the wardrobe. Unlocks are pushed
 * onto a short stack so back-to-back claims each get their own toast (rather than
 * clobbering one another); the toast component dismisses them on a timer.
 */
interface UnlockToastStore {
  items: UnlockToast[];
  push: (name: string, rarity: CosmeticRarity) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useUnlockToastStore = create<UnlockToastStore>((set) => ({
  items: [],
  push: (name, rarity) => set((s) => ({ items: [...s.items, { id: ++nextId, name, rarity }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
