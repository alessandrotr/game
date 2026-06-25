import { create } from 'zustand';

/**
 * HUD chrome state — the single reactive source of truth for "what's on screen".
 *
 * - `hidden` toggles the whole chrome layer for screenshots/immersion (the `H`
 *   key, see `useHudHotkey`). Session-only: a hidden HUD surviving a reload is a
 *   confusing footgun, so it always returns visible on load.
 * - The per-element prefs (`chatCollapsed`) were promoted out of per-component
 *   `usePersistentToggle` so the Settings panel and the components share one
 *   reactive value (toggling Settings updates the live UI). These DO persist,
 *   mirroring the old `"1"/"0"` localStorage convention.
 */

const KEY = {
  chatCollapsed: 'hud.chat.collapsed',
  showPerf: 'hud.perf.show',
  cameraControlMode: 'hud.camera.control.mode',
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

function loadMode(key: string, fallback: 1 | 2): 1 | 2 {
  try {
    const v = localStorage.getItem(key);
    if (v === '1' || v === '2') {
      return Number.parseInt(v) as 1 | 2;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function saveMode(key: string, value: 1 | 2): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage blocked */
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
  /** Show the FPS / render-stats overlay (top-right). */
  showPerf: boolean;
  setShowPerf: (v: boolean) => void;

  /** Camera control mode (1 = zoom on scroll, 2 = height on scroll). */
  cameraControlMode: 1 | 2;
  setCameraControlMode: (mode: 1 | 2) => void;
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

  showPerf: load(KEY.showPerf, false),
  setShowPerf: (v) => {
    save(KEY.showPerf, v);
    set({ showPerf: v });
  },

  cameraControlMode: loadMode(KEY.cameraControlMode, 1),
  setCameraControlMode: (mode) => {
    saveMode(KEY.cameraControlMode, mode);
    set({ cameraControlMode: mode });
  },
}));
