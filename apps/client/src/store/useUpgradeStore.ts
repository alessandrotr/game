import { create } from 'zustand';

/**
 * Visibility of the guest "save progress / create account" dialog. Opened from
 * the character-select screen and the in-game game menu (guests only); the
 * dialog itself is mounted once and reads its open state from here, mirroring
 * the Leaderboard / Settings / Controls panels.
 */
interface UpgradeStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useUpgradeStore = create<UpgradeStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
