import { create } from 'zustand';
import type { LeaderboardCategory, LeaderboardEntry } from '@arena/shared';

/** Cached standings keyed by category — each tab keeps its last-fetched rows so
 *  switching back is instant and the podium's `wins` board survives tab changes. */
type Boards = Partial<Record<LeaderboardCategory, LeaderboardEntry[]>>;

/** Global leaderboard state: open/closed, the active tab, and per-category rows. */
interface LeaderboardStore {
  open: boolean;
  /** True while the active category's request is in flight with no cached rows. */
  loading: boolean;
  /** False when the server reports persistence is disabled. */
  enabled: boolean;
  /** The category shown in the dialog (which tab is selected). */
  category: LeaderboardCategory;
  /** Latest entries per category (best first). Absent = never fetched. */
  boards: Boards;
  setOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setCategory: (category: LeaderboardCategory) => void;
  /** Apply a server reply into the matching category bucket. Clears `loading`
   *  only when the reply is for the tab currently being viewed (a stale reply
   *  for another tab — e.g. the podium's `wins` fetch — must not stop the spinner). */
  set: (category: LeaderboardCategory, enabled: boolean, entries: LeaderboardEntry[]) => void;
}

export const useLeaderboardStore = create<LeaderboardStore>((set) => ({
  open: false,
  loading: false,
  enabled: true,
  category: 'wins',
  boards: {},
  setOpen: (open) => set({ open }),
  setLoading: (loading) => set({ loading }),
  setCategory: (category) => set({ category }),
  set: (category, enabled, entries) =>
    set((s) => ({
      enabled,
      boards: { ...s.boards, [category]: entries },
      loading: category === s.category ? false : s.loading,
    })),
}));
