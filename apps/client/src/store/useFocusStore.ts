import { create } from 'zustand';

/**
 * Cinematic "focus" on a town structure: when the player clicks a monument (the
 * leaderboard tablet, a matchmaking shrine), the camera glides to frame it on the
 * LEFT of the screen while its panel docks RIGHT. This store holds which panel is
 * focused and the world point to frame.
 *
 * `target` drives the camera (read each frame by CameraRig) and the movement lock
 * (MouseMove). `panel` drives the docked-vs-centered layout of the dialog. On small
 * screens we skip the whole treatment (see {@link maybeFocusStructure}) — the panel
 * opens centered as before — so `target` stays null and nothing cinematic happens.
 */

export type FocusPanel = 'leaderboard' | 'pvp' | 'coop';

/** Below this viewport width, model-left + panel-right has no room (the left title
 *  zone and the right-docked panel would collide) — fall back to the normal
 *  centered modal (no camera move, no movement lock). */
export const FOCUS_MIN_WIDTH = 1024;

interface FocusStore {
  /** The focused panel, or null. Drives docked layout. */
  panel: FocusPanel | null;
  /** The focused structure's display title (e.g. "Trial of Blades"), shown big in
   *  the HUD in place of its hidden 3D floating label. */
  title: string | null;
  /** The structure's facing (Y rotation, radians) — its front normal is
   *  (sin, cos). The focus camera stands in front of this so it views the face. */
  faceYaw: number;
  /** World point the camera frames (a structure's ground position), or null when
   *  no cinematic focus is active. */
  target: { x: number; y: number; z: number } | null;
  focus: (panel: FocusPanel, title: string, faceYaw: number, x: number, y: number, z: number) => void;
  /** Clear the focus. Pass a panel to only clear if it's the active one (so one
   *  panel's teardown can't cancel another's). */
  clear: (panel?: FocusPanel) => void;
}

export const useFocusStore = create<FocusStore>((set, get) => ({
  panel: null,
  title: null,
  faceYaw: 0,
  target: null,
  focus: (panel, title, faceYaw, x, y, z) => set({ panel, title, faceYaw, target: { x, y, z } }),
  clear: (panel) => {
    if (panel && get().panel !== panel) return;
    set({ panel: null, title: null, target: null });
  },
}));

/**
 * Begin a cinematic focus on a structure — unless the viewport is too narrow, in
 * which case do nothing and let the caller open the panel centered. Returns whether
 * the cinematic treatment engaged (for symmetry; callers open their dialog either way).
 */
export function maybeFocusStructure(
  panel: FocusPanel,
  title: string,
  faceYaw: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (typeof window !== 'undefined' && window.innerWidth < FOCUS_MIN_WIDTH) return false;
  useFocusStore.getState().focus(panel, title, faceYaw, x, y, z);
  return true;
}
