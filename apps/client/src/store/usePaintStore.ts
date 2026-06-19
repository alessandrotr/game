import { create } from 'zustand';
import { CHARACTER_CLASSES, paintRevOf, type CharacterClass, type PaintState } from '@arena/shared';
import {
  getPaintSurface,
  classPaintOf,
  applyClassPaint,
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
 * Persistence: changes debounce-save to the account (`PUT /paint`) so the look
 * follows the player across devices and is visible to others, with a localStorage
 * mirror for instant restore offline / before the account loads.
 */

const PAINT_KEY = 'paint:'; // paint:<class>:<part>  -> overlay PNG data URL
const SKIN_KEY = 'skin:'; //  skin:<class>:<part>   -> base color hex
const LOCAL_DEBOUNCE_MS = 400;
const SERVER_DEBOUNCE_MS = 900;

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
  /** Load saved paint (account, falling back to localStorage) onto a class. */
  hydrate: (characterClass: CharacterClass) => Promise<void>;
  /** Apply every class's localStorage-mirrored paint at startup (pre-auth). */
  hydrateLocalAll: () => Promise<void>;
  /** Pull every class's paint from the account (after sign-in) onto its surfaces. */
  loadForAccount: () => Promise<void>;
  /** Commit a finished edit on a class: persist, re-rev, broadcast to peers. */
  markPainted: (characterClass: CharacterClass, part: PaintPart) => void;
  undo: (characterClass: CharacterClass, part: PaintPart) => void;
  clear: (characterClass: CharacterClass, part: PaintPart) => void;
}

const localTimers = new Map<string, ReturnType<typeof setTimeout>>();
let serverTimer: ReturnType<typeof setTimeout> | null = null;

function saveLocal(characterClass: CharacterClass, part: PaintPart, skin: string): void {
  const key = `${characterClass}:${part}`;
  const existing = localTimers.get(key);
  if (existing) clearTimeout(existing);
  localTimers.set(
    key,
    setTimeout(() => {
      try {
        localStorage.setItem(PAINT_KEY + key, getPaintSurface(characterClass, part).toPaintDataURL());
        localStorage.setItem(SKIN_KEY + key, skin);
      } catch {
        /* storage full / unavailable — keep the live texture, retry next change */
      }
    }, LOCAL_DEBOUNCE_MS),
  );
}

/**
 * Debounced full-state PUT to the account (every customized class's paint). Once
 * the save LANDS, broadcasts the edited class's revision to peers — broadcasting
 * earlier would make peers fetch /paint/:pid before the PNG exists server-side.
 * With no token (guest), there's nothing to fetch, so neither save nor broadcast.
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
        /* persistence unavailable — local mirror remains; next change retries */
      });
  }, SERVER_DEBOUNCE_MS);
}

/** Load a class's localStorage-mirrored paint onto its surfaces. Returns whether
 *  anything was found (so callers know if the class is customized). */
async function loadLocal(characterClass: CharacterClass): Promise<SkinColors | null> {
  const skins: SkinColors = {};
  let any = false;
  for (const part of PAINT_PARTS) {
    const key = `${characterClass}:${part}`;
    let savedPaint: string | null = null;
    let savedSkin: string | null = null;
    try {
      savedPaint = localStorage.getItem(PAINT_KEY + key);
      savedSkin = localStorage.getItem(SKIN_KEY + key);
    } catch {
      /* storage unavailable */
    }
    if (savedSkin) {
      getPaintSurface(characterClass, part).setSkin(savedSkin);
      skins[part] = savedSkin;
      any = true;
    }
    if (savedPaint) {
      await getPaintSurface(characterClass, part).loadPaintDataURL(savedPaint);
      any = true;
    }
  }
  return any ? skins : null;
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
    commit(set, get, characterClass, part, color);
  },

  hydrate: async (characterClass) => {
    // Prefer the account's copy; fall back to the localStorage mirror.
    const token = useAuthStore.getState().token;
    if (token) {
      try {
        const state = await fetchPaint(token);
        const cls = state[characterClass];
        if (cls && Object.keys(cls).length) {
          await applyClassPaint(characterClass, cls);
          const skins: SkinColors = {};
          for (const part of PAINT_PARTS) if (cls[part]?.skin) skins[part] = cls[part]!.skin;
          set((s) => ({
            skinByClass: { ...s.skinByClass, [characterClass]: { ...s.skinByClass[characterClass], ...skins } },
            customizedByClass: { ...s.customizedByClass, [characterClass]: true },
            revByClass: { ...s.revByClass, [characterClass]: paintRevOf(cls) },
            rev: s.rev + 1,
          }));
          return;
        }
      } catch {
        /* account unreachable — fall through to local mirror */
      }
    }
    const skins = await loadLocal(characterClass);
    if (!skins) return;
    set((s) => ({
      skinByClass: { ...s.skinByClass, [characterClass]: { ...s.skinByClass[characterClass], ...skins } },
      customizedByClass: { ...s.customizedByClass, [characterClass]: true },
      revByClass: { ...s.revByClass, [characterClass]: paintRevOf(classPaintOf(characterClass)) },
      rev: s.rev + 1,
    }));
  },

  hydrateLocalAll: async () => {
    // Apply every class's localStorage-mirrored paint at startup so the player's
    // own look shows instantly on any page load (the char-select preview included),
    // independent of — and before — the account fetch. loadForAccount layers the
    // authoritative server copy on top once signed in.
    for (const cls of CHARACTER_CLASSES) {
      const skins = await loadLocal(cls);
      if (!skins) continue;
      set((s) => ({
        skinByClass: { ...s.skinByClass, [cls]: { ...s.skinByClass[cls], ...skins } },
        customizedByClass: { ...s.customizedByClass, [cls]: true },
        revByClass: { ...s.revByClass, [cls]: paintRevOf(classPaintOf(cls)) },
        rev: s.rev + 1,
      }));
    }
  },

  loadForAccount: async () => {
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
      if (!clsPaint || !Object.keys(clsPaint).length) continue;
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
  },

  markPainted: (characterClass, part) => {
    commit(set, get, characterClass, part, get().skinFor(characterClass, part));
  },

  undo: (characterClass, part) => {
    if (!getPaintSurface(characterClass, part).popUndo()) return;
    commit(set, get, characterClass, part, get().skinFor(characterClass, part));
  },

  clear: (characterClass, part) => {
    getPaintSurface(characterClass, part).clearPaint();
    commit(set, get, characterClass, part, get().skinFor(characterClass, part));
  },
}));

/** Persist (local + account), re-rev, and broadcast a class's paint after a change. */
function commit(
  set: (partial: Partial<PaintStore> | ((s: PaintStore) => Partial<PaintStore>)) => void,
  get: () => PaintStore,
  characterClass: CharacterClass,
  part: PaintPart,
  skin: string,
): void {
  saveLocal(characterClass, part, skin);
  const newRev = paintRevOf(classPaintOf(characterClass));
  set((s) => ({
    customizedByClass: { ...s.customizedByClass, [characterClass]: true },
    revByClass: { ...s.revByClass, [characterClass]: newRev },
    rev: s.rev + 1,
  }));
  // Persist to the account, then broadcast the new rev so peers refetch the PNG
  // only after it actually exists server-side.
  saveServer(get, { cls: characterClass, rev: newRev });
}
