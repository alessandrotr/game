import { create } from 'zustand';

/**
 * Tracks whether the live gameplay connection has gone quiet while the game is
 * still on screen — i.e. the socket dropped but Colyseus hasn't fired `onLeave`
 * yet (a silent stall), or the room reported an error. Drives the "Connection
 * lost" overlay. Separate from the game store so a transient blip doesn't churn
 * gameplay state.
 */
interface ConnectionStore {
  /** True when state has stopped arriving (or the room errored) mid-session. */
  lost: boolean;
  setLost: (lost: boolean) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  lost: false,
  setLost: (lost) => set((s) => (s.lost === lost ? s : { lost })),
}));
