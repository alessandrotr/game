import { create } from 'zustand';

/**
 * Panel-backed sidebar sections. These are the rail entries that expand a content
 * panel beside the rail (as opposed to one-shot actions like "Change character").
 * Kept as a union so the coordinator store stays strongly typed.
 */
export type SidebarSectionId =
  | 'champion'
  | 'store'
  | 'leaderboard'
  | 'controls'
  | 'settings'
  | 'save-progress'
  | 'change-character';

/**
 * The single source of truth for which town sidebar section is expanded.
 *
 * Replaces the previously fragmented per-panel `open` flags (settings / controls /
 * leaderboard / customize) and the game menu's local state. Because there is one
 * `active` slot, sections are mutually exclusive for free — opening one collapses
 * any other. `null` = collapsed to just the rail.
 */
interface SidebarStore {
  active: SidebarSectionId | null;
  open: (id: SidebarSectionId) => void;
  close: () => void;
  toggle: (id: SidebarSectionId) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  active: null,
  open: (id) => set({ active: id }),
  close: () => set({ active: null }),
  toggle: (id) => set((s) => ({ active: s.active === id ? null : id })),
}));
