import { create } from 'zustand';
import type { LeaderboardEntry } from '@arena/shared';

/** Global leaderboard state: open/closed, loading, and the latest entries. */
interface LeaderboardStore {
  open: boolean;
  loading: boolean;
  /** False when the server reports persistence is disabled. */
  enabled: boolean;
  entries: LeaderboardEntry[];
  setOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  set: (enabled: boolean, entries: LeaderboardEntry[]) => void;
}

export const useLeaderboardStore = create<LeaderboardStore>((set) => ({
  open: false,
  loading: false,
  enabled: true,
  entries: [],
  setOpen: (open) => set({ open }),
  setLoading: (loading) => set({ loading }),
  set: (enabled, entries) => set({ enabled, entries, loading: false }),
}));
