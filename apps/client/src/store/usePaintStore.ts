import { create } from 'zustand';
import { paintRevOf, type CharacterClass, type PaintState } from '@arena/shared';
import {
  getPaintSurface,
  classPaintOf,
  applyClassPaint,
  resetPaintSurfaces,
  defaultSkin,
  PAINT_PARTS,
  type PaintPart,
} from '../paint/paintSurface';
import { fetchPaint, putPaint } from '../network/paint';
import { sendPaintRev } from '../network/colyseus';
import { useAuthStore } from './useAuthStore';

/**
 * Brush + skin state for the paint studio, plus bookkeeping for which classes
 * have a custom look. The actual pixels live on the per-class, per-PART
 * PaintSurfaces (head and body are separate meshes). This store tracks the brush
 * color + size, each part's skin color, a `customizedByClass` flag (so renderers
 * apply the textures), a per-class paint `rev` (broadcast so peers refetch), and
 * a `rev` counter that bumps on any change so React views re-read.
 *
 * Paint is ACCOUNT-SCOPED: it lives only on the server (per account), never in
 * localStorage — a device-global mirror would bleed one account's paint into the
 * next on logout/login. `reset()` clears the in-memory surfaces + state on account
 * switch so nothing leaks across accounts.
 */

const SERVER_DEBOUNCE_MS = 700;

const PALETTE = [
  '#1b1d24', '#ffffff', '#e23b3b', '#f0883e', '#f5d442',
  '#4caf50', '#2f9bd6', '#3b4cca', '#9b59b6', '#e87fb0',
  '#7a5230', '#cfd3da',
];

type SkinColors = Partial<Record<PaintPart, string>>;

interface PaintStore {
  color: string;
  skinByClass: Partial<Record<CharacterClass, SkinColors>>;
  brush: number;
  palette: string[];
  customizedByClass: Partial<Record<CharacterClass, boolean>>;
  /** Per-class content revision of the paint (for peer refetch / join options). */
  revByClass: Partial<Record<CharacterClass, string>>;
  rev: number;

  setColor: (color: string) => void;
  setBrush: (brush: number) => void;
  setSkin: (characterClass: CharacterClass, part: PaintPart, color: string) => void;
  skinFor: (characterClass: CharacterClass, part: PaintPart) => string;
  /** This class's paint revision ('' = no custom paint) — for join options. */
  revFor: (characterClass: CharacterClass) => string;
  /** Load one class's paint from the account onto its surfaces. */
  hydrate: (characterClass: CharacterClass) => Promise<void>;
  /** Reset + pull every class's paint from the account (call on sign-in). */
  loadForAccount: () => Promise<void>;
  /** Clear all in-memory surfaces + state (call on sign-out / account switch). */
  reset: () => void;
  markPainted: (characterClass: CharacterClass, part: PaintPart) => void;
  undo: (characterClass: CharacterClass, part: PaintPart) => void;
  clear: (characterClass: CharacterClass, part: PaintPart) => void;
}

let serverTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced full-state PUT to the account (every customized class's paint). Once
 * the save LANDS, broadcasts the edited class's revision to peers — broadcasting
 * earlier would make peers fetch /paint/:pid before the PNG exists server-side.
 */
function saveServer(get: () => PaintStore, broadcast: { cls: CharacterClass; rev: string }): void {
  const token = useAuthStore.getState().token;
  if (!token) return;
  if (serverTimer) clearTimeout(serverTimer);
  serverTimer = setTimeout(() => {
    const state: PaintState = {};
    for (const cls of Object.keys(get().customizedByClass) as CharacterClass[]) {
      if (get().customizedByClass[cls]) state[cls] = classPaintOf(cls);
    }
    void putPaint(token, state)
      .then(() => sendPaintRev(broadcast.cls, broadcast.rev))
      .catch(() => {
        /* persistence unavailable — next change retries */
      });
  }, SERVER_DEBOUNCE_MS);
}

/** Apply a fetched class paint onto surfaces + reflect it in the store. */
async function adopt(
  set: (fn: (s: PaintStore) => Partial<PaintStore>) => void,
  cls: CharacterClass,
  clsPaint: NonNullable<PaintState[CharacterClass]>,
): Promise<void> {
  await applyClassPaint(cls, clsPaint);
  const skins: SkinColors = {};
  for (const part of PAINT_PARTS) if (clsPaint[part]?.skin) skins[part] = clsPaint[part]!.skin;
  set((s) => ({
    skinByClass: { ...s.skinByClass, [cls]: { ...s.skinByClass[cls], ...skins } },
    customizedByClass: { ...s.customizedByClass, [cls]: true },
    revByClass: { ...s.revByClass, [cls]: paintRevOf(clsPaint) },
    rev: s.rev + 1,
  }));
}

export const usePaintStore = create<PaintStore>((set, get) => ({
  color: '#1b1d24',
  skinByClass: {},
  brush: 10,
  palette: PALETTE,
  customizedByClass: {},
  revByClass: {},
  rev: 0,

  setColor: (color) => set({ color }),
  setBrush: (brush) => set({ brush }),

  skinFor: (characterClass, part) => get().skinByClass[characterClass]?.[part] ?? defaultSkin(part),
  revFor: (characterClass) => get().revByClass[characterClass] ?? '',

  setSkin: (characterClass, part, color) => {
    getPaintSurface(characterClass, part).setSkin(color);
    set((s) => ({
      skinByClass: {
        ...s.skinByClass,
        [characterClass]: { ...s.skinByClass[characterClass], [part]: color },
      },
    }));
    commit(set, get, characterClass);
  },

  hydrate: async (characterClass) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const state = await fetchPaint(token);
      const cls = state[characterClass];
      if (cls && Object.keys(cls).length) await adopt(set, characterClass, cls);
    } catch {
      /* account unreachable — render defaults; a later load retries */
    }
  },

  loadForAccount: async () => {
    get().reset();
    const token = useAuthStore.getState().token;
    if (!token) return;
    let state: PaintState;
    try {
      state = await fetchPaint(token);
    } catch {
      return;
    }
    for (const cls of Object.keys(state) as CharacterClass[]) {
      const clsPaint = state[cls];
      if (clsPaint && Object.keys(clsPaint).length) await adopt(set, cls, clsPaint);
    }
  },

  reset: () => {
    if (serverTimer) clearTimeout(serverTimer);
    resetPaintSurfaces();
    set((s) => ({
      skinByClass: {},
      customizedByClass: {},
      revByClass: {},
      rev: s.rev + 1,
    }));
  },

  markPainted: (characterClass) => commit(set, get, characterClass),

  undo: (characterClass, part) => {
    if (!getPaintSurface(characterClass, part).popUndo()) return;
    commit(set, get, characterClass);
  },

  clear: (characterClass, part) => {
    getPaintSurface(characterClass, part).clearPaint();
    commit(set, get, characterClass);
  },
}));

/** Re-rev a class after a change, then debounce-save to the account + broadcast. */
function commit(
  set: (partial: Partial<PaintStore> | ((s: PaintStore) => Partial<PaintStore>)) => void,
  get: () => PaintStore,
  characterClass: CharacterClass,
): void {
  const newRev = paintRevOf(classPaintOf(characterClass));
  set((s) => ({
    customizedByClass: { ...s.customizedByClass, [characterClass]: true },
    revByClass: { ...s.revByClass, [characterClass]: newRev },
    rev: s.rev + 1,
  }));
  saveServer(get, { cls: characterClass, rev: newRev });
}
