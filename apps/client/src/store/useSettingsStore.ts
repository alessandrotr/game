import { create } from 'zustand';

/** Settings dialog open/closed state, so the game menu can open it without prop drilling. */
interface SettingsStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
