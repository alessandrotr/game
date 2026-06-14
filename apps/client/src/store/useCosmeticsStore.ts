import { create } from 'zustand';
import {
  MAX_EMOTE_SLOTS,
  classCosmeticsOf,
  getCosmeticOfType,
  sanitizeLoadout,
  sanitizeState,
  type CharacterClass,
  type CosmeticsState,
  type Loadout,
} from '@arena/shared';
import { fetchCosmetics, putCosmetics } from '../network/cosmetics';
import { useAuthStore } from './useAuthStore';
import { sendEquipLoadout } from '../network/colyseus';

/** The appearance-affecting subset of a loadout, for one class. */
export interface Appearance {
  skinId: string;
  dyeId: string;
  pedestalId: string;
  titleId: string;
}

interface CosmeticsStore {
  /** Per-class wardrobes (owned ids + equipped loadout). A class absent here
   *  resolves to defaults via the selectors below. */
  byClass: CosmeticsState;

  /** Does this class own the cosmetic? */
  isOwned: (characterClass: CharacterClass, id: string) => boolean;
  /** This class's equipped loadout (defaults when untouched). */
  loadoutFor: (characterClass: CharacterClass) => Loadout;
  /** The equipped appearance for a class (for join options / live broadcast). */
  appearanceFor: (characterClass: CharacterClass) => Appearance;

  /** Seed from an auth response (called on every successful sign-in/restore). */
  hydrate: (state: CosmeticsState) => void;
  /** Refresh from the server (call once after auth, like camera prefs). */
  loadForAccount: () => Promise<void>;
  /** Claim a cosmetic for this class for free (no economy yet); persists. */
  unlock: (characterClass: CharacterClass, id: string) => void;
  /** Equip a partial loadout change for a class; broadcasts live + persists. */
  equip: (characterClass: CharacterClass, patch: Partial<Loadout>) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced server save of the whole per-class state (skipped without a token). */
function scheduleSave(get: () => CosmeticsStore): void {
  const token = useAuthStore.getState().token;
  if (!token) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void putCosmetics(token, get().byClass)
      .then((state) => useCosmeticsStore.setState({ byClass: state }))
      .catch(() => {
        /* persistence unavailable — keep local; next change retries */
      });
  }, 400);
}

export const useCosmeticsStore = create<CosmeticsStore>((set, get) => ({
  byClass: {},

  isOwned: (characterClass, id) => classCosmeticsOf(get().byClass, characterClass).owned.includes(id),

  loadoutFor: (characterClass) => classCosmeticsOf(get().byClass, characterClass).loadout,

  appearanceFor: (characterClass) => {
    const loadout = classCosmeticsOf(get().byClass, characterClass).loadout;
    return { skinId: loadout.skinId, dyeId: loadout.dyeId, pedestalId: loadout.pedestalId, titleId: loadout.titleId };
  },

  hydrate: (state) => set({ byClass: sanitizeState(state) }),

  loadForAccount: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      set({ byClass: await fetchCosmetics(token) });
    } catch {
      /* server/DB unavailable — keep what we have (seeded from the auth response) */
    }
  },

  unlock: (characterClass, id) => {
    const cur = classCosmeticsOf(get().byClass, characterClass);
    if (cur.owned.includes(id)) return;
    set({ byClass: { ...get().byClass, [characterClass]: { ...cur, owned: [...cur.owned, id] } } });
    scheduleSave(get);
  },

  equip: (characterClass, patch) => {
    const cur = classCosmeticsOf(get().byClass, characterClass);
    const merged: Loadout = {
      ...cur.loadout,
      ...patch,
      ...(patch.emotes ? { emotes: patch.emotes.slice(0, MAX_EMOTE_SLOTS) } : {}),
    };
    // Re-sanitize against this class's owned set so you can never equip what you
    // don't own, and a skin must belong to this class.
    const loadout = sanitizeLoadout(merged, cur.owned, characterClass);
    set({ byClass: { ...get().byClass, [characterClass]: { owned: cur.owned, loadout } } });
    // Broadcast live so the town sees it (the editor only ever touches the class
    // the player is currently in-world as).
    sendEquipLoadout({
      skinId: loadout.skinId,
      dyeId: loadout.dyeId,
      pedestalId: loadout.pedestalId,
      titleId: loadout.titleId,
    });
    scheduleSave(get);
  },
}));

/** Equip a skin for a class (or clear it with ''). Validates the class match. */
export function equipSkin(characterClass: CharacterClass, skinId: string): void {
  if (skinId && getCosmeticOfType(skinId, 'skin')?.characterClass !== characterClass) return;
  useCosmeticsStore.getState().equip(characterClass, { skinId });
}
