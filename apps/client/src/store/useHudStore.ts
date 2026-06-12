import { create } from 'zustand';

/**
 * HUD chrome state — the single reactive source of truth for "what's on screen".
 *
 * - `hidden` toggles the whole chrome layer for screenshots/immersion (the `H`
 *   key, see `useHudHotkey`). Session-only: a hidden HUD surviving a reload is a
 *   confusing footgun, so it always returns visible on load.
 * - The per-element prefs (`chatCollapsed`, `playerCardCompact`) were promoted out
 *   of per-component `usePersistentToggle` so the Settings panel and the
 *   components share one reactive value (toggling Settings updates the live UI).
 *   These DO persist, mirroring the old `"1"/"0"` localStorage convention.
 *   (The player card is town-only now — arena packs identity into the CombatHud —
 *   so a single compact pref suffices.)
 */

const KEY = {
  chatCollapsed: 'hud.chat.collapsed',
  playerCardCompact: 'hud.playercard.compact',
} as const;

/** Read a persisted boolean ("1"/"0"), falling back when unset/unavailable. */
function load(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** Mirror a boolean to localStorage; ignore failures (private mode, blocked). */
function save(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* storage blocked — value only lasts this session */
  }
}

interface HudStore {
  /** Whole-HUD visibility (session-only). */
  hidden: boolean;
  toggleHidden: () => void;
  setHidden: (v: boolean) => void;

  /** Persisted per-element prefs. */
  chatCollapsed: boolean;
  setChatCollapsed: (v: boolean) => void;
  playerCardCompact: boolean;
  setPlayerCardCompact: (v: boolean) => void;
}

export const useHudStore = create<HudStore>((set) => ({
  hidden: false,
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
  setHidden: (hidden) => set({ hidden }),

  chatCollapsed: load(KEY.chatCollapsed, false),
  setChatCollapsed: (v) => {
    save(KEY.chatCollapsed, v);
    set({ chatCollapsed: v });
  },

  playerCardCompact: load(KEY.playerCardCompact, false),
  setPlayerCardCompact: (v) => {
    save(KEY.playerCardCompact, v);
    set({ playerCardCompact: v });
  },
}));
