import { create } from 'zustand';

/**
 * The local player's current auto-attack target (a player session id), for the
 * on-screen target marker. The server is authoritative for the actual attacking;
 * this is just the client's intent/highlight. Cleared by a manual move order.
 */
interface TargetStore {
  targetId: string | null;
  setTarget: (id: string | null) => void;
}

export const useTargetStore = create<TargetStore>((set) => ({
  targetId: null,
  setTarget: (id) => set((s) => (s.targetId === id ? s : { targetId: id })),
}));
