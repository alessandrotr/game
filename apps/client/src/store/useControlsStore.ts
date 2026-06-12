import { create } from 'zustand';

/** Persisted flag: has the player dismissed the controls helper at least once? */
const SEEN_KEY = 'controls.seen';

function loadSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Controls-helper visibility. Auto-opens once for a new player (until they
 * dismiss it), and can be reopened any time from the game menu. Dismissal is
 * persisted so it doesn't nag on every load.
 */
interface ControlsStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useControlsStore = create<ControlsStore>((set) => ({
  open: !loadSeen(),
  setOpen: (open) => {
    if (!open) {
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* storage blocked — it'll just show again next session */
      }
    }
    set({ open });
  },
}));
