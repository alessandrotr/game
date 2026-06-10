import { create } from 'zustand';

/** Transient "you leveled up" HUD banner state for the local player. `nonce`
 *  bumps on every level-up so the toast re-triggers even on repeated levels. */
interface LevelUpStore {
  level: number | null;
  nonce: number;
  show: (level: number) => void;
  clear: () => void;
}

export const useLevelUpStore = create<LevelUpStore>((set) => ({
  level: null,
  nonce: 0,
  show: (level) => set((s) => ({ level, nonce: s.nonce + 1 })),
  clear: () => set({ level: null }),
}));
