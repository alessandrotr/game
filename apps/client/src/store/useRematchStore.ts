import { create } from 'zustand';

/**
 * Post-match rematch vote state, shared by the arena (PvP) and zombie defeat
 * screens. The server opens a vote when a match/run ends; this tracks the tally
 * and whether the local player has accepted. Cleared on travel to a new room.
 */
interface RematchStore {
  /** True once the server has opened a rematch vote (a RematchUpdate arrived). */
  active: boolean;
  /** How many of the group have accepted so far. */
  ready: number;
  /** How many humans must accept for the rematch to start. */
  total: number;
  /** Epoch ms the vote window closes (for the countdown). */
  deadlineMs: number;
  /** Whether the local player has accepted. */
  accepted: boolean;
  /** Update the tally from a server RematchUpdate (also marks the vote active). */
  update: (u: { ready: number; total: number; deadlineMs: number }) => void;
  /** Record that the local player accepted (optimistic, before the next tally). */
  markAccepted: () => void;
  /** Clear back to idle (new room / returned to town). */
  reset: () => void;
}

export const useRematchStore = create<RematchStore>((set) => ({
  active: false,
  ready: 0,
  total: 0,
  deadlineMs: 0,
  accepted: false,
  update: ({ ready, total, deadlineMs }) => set({ active: true, ready, total, deadlineMs }),
  markAccepted: () => set({ accepted: true }),
  reset: () => set({ active: false, ready: 0, total: 0, deadlineMs: 0, accepted: false }),
}));
