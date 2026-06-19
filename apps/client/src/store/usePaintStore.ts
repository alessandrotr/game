import { create } from 'zustand';
import type { CharacterClass } from '@arena/shared';
import { getPaintSurface, PAINT_PARTS, type PaintPart } from '../paint/paintSurface';
import { BODY_BASE_COLOR } from '../assets/data/humanoid';

/**
 * Brush + skin state for the paint studio, plus bookkeeping for which classes
 * have a custom look. The actual pixels live on the per-class, per-PART
 * PaintSurfaces (head and body are separate meshes, so each has its own surface:
 * independent skin color + paint overlay). This store tracks the brush color +
 * size, each part's skin color, a `customizedByClass` flag (so renderers know
 * whether to apply the textures), and a `rev` counter that bumps on every change
 * so React-driven views re-read.
 *
 * Persistence: each change debounce-saves to localStorage — per class+part, the
 * skin color and the (transparent) paint overlay PNG, so reloading restores the
 * editable layered state. (Server persistence + multiplayer sync layer on top of
 * this in the next pass.)
 */

const PAINT_KEY = 'paint:'; // paint:<class>:<part>  -> overlay PNG data URL
const SKIN_KEY = 'skin:'; //  skin:<class>:<part>   -> base color hex
const SAVE_DEBOUNCE_MS = 500;

const PALETTE = [
  '#1b1d24', '#ffffff', '#e23b3b', '#f0883e', '#f5d442',
  '#4caf50', '#2f9bd6', '#3b4cca', '#9b59b6', '#e87fb0',
  '#7a5230', '#cfd3da',
];

type SkinColors = Partial<Record<PaintPart, string>>;

interface PaintStore {
  /** Brush (paint) color. */
  color: string;
  /** Skin base color per class, per part (body / head). */
  skinByClass: Partial<Record<CharacterClass, SkinColors>>;
  brush: number;
  /** Suggested swatches for the brush. */
  palette: string[];
  /** Which classes have a non-default look (custom skin and/or paint). */
  customizedByClass: Partial<Record<CharacterClass, boolean>>;
  /** Bumps on any change; views that must reflect the surface subscribe to it. */
  rev: number;

  setColor: (color: string) => void;
  setBrush: (brush: number) => void;
  /** Pick the skin base color for a class's part; recolors that base + persists. */
  setSkin: (characterClass: CharacterClass, part: PaintPart, color: string) => void;
  skinFor: (characterClass: CharacterClass, part: PaintPart) => string;
  /** Load this class's saved skin + paint onto its surfaces, if any. */
  hydrate: (characterClass: CharacterClass) => Promise<void>;
  /** Mark a class customized + schedule a save. Called after a brush stroke. */
  markPainted: (characterClass: CharacterClass, part: PaintPart) => void;
  /** Undo the last stroke on a class's part surface. */
  undo: (characterClass: CharacterClass, part: PaintPart) => void;
  /** Wipe paint back to bare skin for a class's part. */
  clear: (characterClass: CharacterClass, part: PaintPart) => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(characterClass: CharacterClass, part: PaintPart, skin: string): void {
  const key = `${characterClass}:${part}`;
  const existing = saveTimers.get(key);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    key,
    setTimeout(() => {
      try {
        localStorage.setItem(PAINT_KEY + key, getPaintSurface(characterClass, part).toPaintDataURL());
        localStorage.setItem(SKIN_KEY + key, skin);
      } catch {
        /* storage full / unavailable — keep the live texture, retry on next change */
      }
    }, SAVE_DEBOUNCE_MS),
  );
}

export const usePaintStore = create<PaintStore>((set, get) => ({
  color: '#1b1d24',
  skinByClass: {},
  brush: 10,
  palette: PALETTE,
  customizedByClass: {},
  rev: 0,

  setColor: (color) => set({ color }),
  setBrush: (brush) => set({ brush }),

  skinFor: (characterClass, part) => get().skinByClass[characterClass]?.[part] ?? BODY_BASE_COLOR,

  setSkin: (characterClass, part, color) => {
    getPaintSurface(characterClass, part).setSkin(color);
    scheduleSave(characterClass, part, color);
    set((s) => ({
      skinByClass: {
        ...s.skinByClass,
        [characterClass]: { ...s.skinByClass[characterClass], [part]: color },
      },
      customizedByClass: { ...s.customizedByClass, [characterClass]: true },
      rev: s.rev + 1,
    }));
  },

  hydrate: async (characterClass) => {
    const loadedSkins: SkinColors = {};
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
        loadedSkins[part] = savedSkin;
        any = true;
      }
      if (savedPaint) {
        await getPaintSurface(characterClass, part).loadPaintDataURL(savedPaint);
        any = true;
      }
    }
    if (!any) return;
    set((s) => ({
      skinByClass: { ...s.skinByClass, [characterClass]: { ...s.skinByClass[characterClass], ...loadedSkins } },
      customizedByClass: { ...s.customizedByClass, [characterClass]: true },
      rev: s.rev + 1,
    }));
  },

  markPainted: (characterClass, part) => {
    scheduleSave(characterClass, part, get().skinFor(characterClass, part));
    set((s) =>
      s.customizedByClass[characterClass]
        ? { rev: s.rev + 1 }
        : { customizedByClass: { ...s.customizedByClass, [characterClass]: true }, rev: s.rev + 1 },
    );
  },

  undo: (characterClass, part) => {
    if (!getPaintSurface(characterClass, part).popUndo()) return;
    scheduleSave(characterClass, part, get().skinFor(characterClass, part));
    set((s) => ({ rev: s.rev + 1 }));
  },

  clear: (characterClass, part) => {
    getPaintSurface(characterClass, part).clearPaint();
    scheduleSave(characterClass, part, get().skinFor(characterClass, part));
    set((s) => ({ rev: s.rev + 1 }));
  },
}));
