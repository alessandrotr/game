import { create } from 'zustand';
import type { ZombieLobbyView } from '@arena/shared';

/**
 * Client mirror of the co-op Zombie matchmaking room's replicated state, fed by
 * the zombie-matchmaking connection's `onStateChange`. Holds the live squad-lobby
 * list plus the UI bits the browser / lobby screens need. `mySessionId` is this
 * client's id *in the zombie matchmaking room* — used to find which lobby is ours.
 */
interface ZombieLobbyStore {
  mySessionId: string | null;
  lobbies: ZombieLobbyView[];
  /** Whether the co-op matchmaking overlay is open. */
  menuOpen: boolean;
  /** Last rejected-intent message from the server (validation, full, bad code). */
  error: string | null;

  setSession: (id: string | null) => void;
  setLobbies: (lobbies: ZombieLobbyView[]) => void;
  setMenuOpen: (open: boolean) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

export const useZombieLobbyStore = create<ZombieLobbyStore>((set) => ({
  mySessionId: null,
  lobbies: [],
  menuOpen: false,
  error: null,

  setSession: (mySessionId) => set({ mySessionId }),
  setLobbies: (lobbies) => set({ lobbies }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setError: (error) => set({ error }),
  reset: () => set({ mySessionId: null, lobbies: [], menuOpen: false, error: null }),
}));

/** The squad lobby (if any) that contains the local player. */
export function findMyZombieLobby(
  lobbies: ZombieLobbyView[],
  mySessionId: string | null,
): ZombieLobbyView | null {
  if (!mySessionId) return null;
  return lobbies.find((l) => l.members.some((m) => m.sessionId === mySessionId)) ?? null;
}
