import { create } from 'zustand';
import type { PerkId } from '@arena/shared';

/** Transient perk-offer state (set by the server message, cleared on pick). */
interface PerkStore {
  /** The two visible perk ids offered this wave (null = no offer pending). */
  offer: { visible: PerkId[]; isUpgrade: boolean; fixedUpgradeFrom?: PerkId; fixedUpgradeTo?: PerkId } | null;
  /** Set the current offer (fired by the ServerMessage.PerkOffer listener). */
  setOffer: (offer: PerkStore['offer']) => void;
  /** Clear the offer (fired after the player picks). */
  clearOffer: () => void;
}

export const usePerkStore = create<PerkStore>((set) => ({
  offer: null,
  setOffer: (offer) => set({ offer }),
  clearOffer: () => set({ offer: null }),
}));
