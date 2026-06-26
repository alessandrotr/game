import { create } from 'zustand';

/**
 * Customization hub state. The hub itself lives in the town sidebar — which of
 * its two views (Champion / Store) shows is driven by the sidebar's active
 * section, so this store no longer owns an open/tab flag. It keeps the bits the
 * hub views share: the try-on preview and the full-screen paint studio toggle.
 */
interface CustomizeStore {
  /** Cosmetic id being previewed on the showcase avatar (try-before-equip). Not
   *  persisted or equipped — purely a visual try-on. `null` = show the equipped
   *  look. For an emote, the showcase character plays it. Cleared when the hub
   *  closes. */
  previewId: string | null;
  /** Preview a cosmetic on the avatar (pass null to clear). */
  setPreview: (id: string | null) => void;

  /** The paint studio is a focused, full-screen surface launched from the hub. */
  paintOpen: boolean;
  openPaint: () => void;
  closePaint: () => void;
}

export const useCustomizeStore = create<CustomizeStore>((set) => ({
  previewId: null,
  setPreview: (id) => set({ previewId: id }),

  paintOpen: false,
  openPaint: () => set({ paintOpen: true }),
  closePaint: () => set({ paintOpen: false }),
}));
