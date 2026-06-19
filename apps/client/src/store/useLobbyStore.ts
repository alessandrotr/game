import { create } from 'zustand';
import type { LobbyMode, LobbyView } from '@arena/shared';

/** Browser filter for match size. */
export type ModeFilter = LobbyMode | 'all';
/** Browser filter for lobby status. */
export type StatusFilter = 'in-queue' | 'all';

/**
 * Client mirror of the matchmaking room's replicated state (Phase 12), fed by
 * the matchmaking connection's `onStateChange`. Holds the live lobby list plus
 * the UI bits the browser/lobby/ready-check screens need. `mySessionId` is this
 * client's id *in the matchmaking room* — used to find which slot is ours.
 */
interface LobbyStore {
  mySessionId: string | null;
  lobbies: LobbyView[];
  /** Whether the matchmaking overlay is open (purely UI; you stay in your lobby
   *  in the background when it's closed). */
  menuOpen: boolean;
  /** Lobby the browser is previewing (to pick a slot in). Null = show the list. */
  selectedLobbyId: string | null;
  /** Whether the standalone "your match" queue dialog is open. Fully independent
   *  of the matchmaking menu + cinematic focus — it's a main-HUD element. */
  queueOpen: boolean;
  modeFilter: ModeFilter;
  statusFilter: StatusFilter;
  /** Last rejected-intent message from the server (validation, race, timeout). */
  error: string | null;

  setSession: (id: string | null) => void;
  setLobbies: (lobbies: LobbyView[]) => void;
  setMenuOpen: (open: boolean) => void;
  setSelectedLobbyId: (id: string | null) => void;
  setQueueOpen: (open: boolean) => void;
  setModeFilter: (mode: ModeFilter) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  mySessionId: null,
  lobbies: [],
  menuOpen: false,
  selectedLobbyId: null,
  queueOpen: false,
  modeFilter: 'all',
  statusFilter: 'all',
  error: null,

  setSession: (mySessionId) => set({ mySessionId }),
  setLobbies: (lobbies) => set({ lobbies }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setSelectedLobbyId: (selectedLobbyId) => set({ selectedLobbyId }),
  setQueueOpen: (queueOpen) => set({ queueOpen }),
  setModeFilter: (modeFilter) => set({ modeFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ mySessionId: null, lobbies: [], menuOpen: false, selectedLobbyId: null, queueOpen: false, error: null }),
}));

/** The lobby (if any) that contains the local player's matchmaking slot. */
export function findMyLobby(lobbies: LobbyView[], mySessionId: string | null): LobbyView | null {
  if (!mySessionId) return null;
  return (
    lobbies.find((l) =>
      [...l.blue, ...l.red].some((s) => s.sessionId === mySessionId),
    ) ?? null
  );
}
