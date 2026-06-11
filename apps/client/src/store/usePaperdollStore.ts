import { create } from 'zustand';
import type { CharacterClass } from '@arena/shared';

/** A snapshot of a player's info, captured when their paperdoll is opened. */
export interface PaperdollData {
  sessionId: string;
  name: string;
  characterClass: CharacterClass;
  level: number;
  xp: number;
  kills: number;
  deaths: number;
}

interface PaperdollStore {
  data: PaperdollData | null;
  open: (data: PaperdollData) => void;
  close: () => void;
}

/** The currently-open player paperdoll (town only). */
export const usePaperdollStore = create<PaperdollStore>((set) => ({
  data: null,
  open: (data) => set({ data }),
  close: () => set({ data: null }),
}));
