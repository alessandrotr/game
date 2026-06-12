import { create } from 'zustand';

/**
 * Client-side combat feature flags, mirrored to the authoritative server. Today:
 * the auto-attack toggle (off by default — combat is abilities-only unless a dev
 * flips this on). Persisted so it survives reloads; pushed to the room by
 * `useServerCombatFlags` and read by the input layer to gate left-click attacks.
 */
const KEY = 'combat.autoAttack';

function load(fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function save(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* storage blocked — value only lasts this session */
  }
}

interface CombatFlagsStore {
  autoAttack: boolean;
  setAutoAttack: (v: boolean) => void;
}

export const useCombatFlagsStore = create<CombatFlagsStore>((set) => ({
  autoAttack: load(false),
  setAutoAttack: (v) => {
    save(v);
    set({ autoAttack: v });
  },
}));
