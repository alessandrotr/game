import { create } from 'zustand';

/** Which tab the customization hub opens to. */
export type CustomizeTab = 'customize' | 'paint' | 'store';

interface CustomizeStore {
  open: boolean;
  tab: CustomizeTab;
  /** Cosmetic id being previewed on the showcase avatar (try-before-equip). Not
   *  persisted or equipped — purely a visual try-on. `null` = show the equipped
   *  look. For an emote, the showcase character plays it. Cleared when the hub
   *  closes or the tab changes. */
  previewId: string | null;
  /** Open the hub (optionally to a specific tab). */
  show: (tab?: CustomizeTab) => void;
  setOpen: (open: boolean) => void;
  setTab: (tab: CustomizeTab) => void;
  /** Preview a cosmetic on the avatar (pass null to clear). */
  setPreview: (id: string | null) => void;
}

/**
 * Controls the player's customization & store hub (a large modal opened from the
 * town player card). Store-controlled like the leaderboard, so any HUD affordance
 * can open it to a chosen tab.
 */
export const useCustomizeStore = create<CustomizeStore>((set) => ({
  open: false,
  tab: 'customize',
  previewId: null,
  show: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab, previewId: null })),
  setOpen: (open) => set((s) => ({ open, previewId: open ? s.previewId : null })),
  setTab: (tab) => set({ tab, previewId: null }),
  setPreview: (id) => set({ previewId: id }),
}));
