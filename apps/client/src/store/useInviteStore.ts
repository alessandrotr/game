import { create } from 'zustand';
import type { LobbyMode } from '@arena/shared';

/** A received match invite awaiting the local player's accept/decline. `nonce`
 *  bumps on every new invite so the toast re-triggers even back-to-back. */
export interface IncomingInvite {
  inviteId: string;
  fromName: string;
  mode: LobbyMode;
}

interface InviteStore {
  invite: IncomingInvite | null;
  nonce: number;
  show: (invite: IncomingInvite) => void;
  clear: () => void;
}

export const useInviteStore = create<InviteStore>((set) => ({
  invite: null,
  nonce: 0,
  show: (invite) => set((s) => ({ invite, nonce: s.nonce + 1 })),
  clear: () => set({ invite: null }),
}));
