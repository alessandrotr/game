import { create } from 'zustand';
import type { MatchScore, Team } from '@arena/shared';

/** The end-of-match result, set when the server broadcasts `MatchOver` and
 *  cleared when the player returns to town (or starts a new connection). */
export interface MatchResult {
  winnerTeam: Team;
  target: number;
  scores: MatchScore[];
}

interface MatchResultStore {
  result: MatchResult | null;
  set: (result: MatchResult) => void;
  clear: () => void;
}

export const useMatchResultStore = create<MatchResultStore>((set) => ({
  result: null,
  set: (result) => set({ result }),
  clear: () => set({ result: null }),
}));
