import { create } from 'zustand';

/** Which tab the customization hub opens to. */
export type CustomizeTab = 'profile' | 'customize' | 'store';

interface CustomizeStore {
  open: boolean;
  tab: CustomizeTab;
  /** Open the hub (optionally to a specific tab). */
  show: (tab?: CustomizeTab) => void;
  setOpen: (open: boolean) => void;
  setTab: (tab: CustomizeTab) => void;
}

/**
 * Controls the player's customization & store hub (a large modal opened from the
 * town player card). Store-controlled like the leaderboard, so any HUD affordance
 * can open it to a chosen tab.
 */
export const useCustomizeStore = create<CustomizeStore>((set) => ({
  open: false,
  tab: 'profile',
  show: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
}));
