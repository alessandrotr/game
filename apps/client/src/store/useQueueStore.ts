import { create } from 'zustand';
import { teamSizeForMode, type LobbyMode, type QueueMemberView } from '@arena/shared';

/**
 * Client mirror of the PvP matchmaking room's replicated queue, fed by the
 * matchmaking connection's `onStateChange`. Holds every queued player plus the UI
 * bits the format menu + queue badge need. `mySessionId` is this client's id *in
 * the matchmaking room* — used to find which format we're queued for.
 */
interface QueueStore {
  mySessionId: string | null;
  members: QueueMemberView[];
  /** Whether the format menu overlay is open (purely UI; you stay queued in the
   *  background when it's closed). */
  menuOpen: boolean;
  /** Last rejected-intent / notice message from the server (bad mode, declined
   *  invite, etc.). */
  error: string | null;

  setSession: (id: string | null) => void;
  setMembers: (members: QueueMemberView[]) => void;
  setMenuOpen: (open: boolean) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

export const useQueueStore = create<QueueStore>((set) => ({
  mySessionId: null,
  members: [],
  menuOpen: false,
  error: null,

  setSession: (mySessionId) => set({ mySessionId }),
  setMembers: (members) => set({ members }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setError: (error) => set({ error }),
  reset: () => set({ mySessionId: null, members: [], menuOpen: false, error: null }),
}));

/** The format the local player is currently queued for, or null. */
export function myQueueMode(members: QueueMemberView[], mySessionId: string | null): LobbyMode | null {
  if (!mySessionId) return null;
  return members.find((m) => m.sessionId === mySessionId)?.mode ?? null;
}

/** Live count of players waiting in a given format's queue. */
export function countForMode(members: QueueMemberView[], mode: LobbyMode): number {
  return members.reduce((n, m) => (m.mode === mode ? n + 1 : n), 0);
}

/** Whether the player with this TOWN session id is currently queued (so the
 *  paperdoll can show "already in queue" and block inviting them). */
export function isTownSessionQueued(members: QueueMemberView[], townSessionId: string): boolean {
  return members.some((m) => m.townSessionId === townSessionId);
}

/** Total seats a format needs (both teams) — the queue badge's denominator. */
export function capacityForMode(mode: LobbyMode): number {
  return 2 * teamSizeForMode(mode);
}
