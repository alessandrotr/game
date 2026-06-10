import { create } from 'zustand';

/** Town matchmaking UI state: whether we're queued and how many are waiting. */
interface MatchmakingStore {
  searching: boolean;
  size: number;
  set: (searching: boolean, size: number) => void;
  reset: () => void;
}

export const useMatchmakingStore = create<MatchmakingStore>((set) => ({
  searching: false,
  size: 0,
  set: (searching, size) => set({ searching, size }),
  reset: () => set({ searching: false, size: 0 }),
}));
