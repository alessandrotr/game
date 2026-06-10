import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isCharacterClass, type CharacterClass } from '@arena/shared';

interface CharacterStore {
  /** The class the player has selected for their next match. */
  selectedClass: CharacterClass;
  setSelectedClass: (characterClass: CharacterClass) => void;
}

/**
 * Persists the player's class selection across reloads (localStorage). Kept
 * separate from the live game store so it survives disconnects and sessions.
 */
export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set) => ({
      selectedClass: 'warrior',
      setSelectedClass: (characterClass) => set({ selectedClass: characterClass }),
    }),
    {
      name: 'arena:character',
      // Guard against stale/invalid persisted values.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<CharacterStore> | undefined)?.selectedClass;
        return {
          ...current,
          selectedClass: isCharacterClass(saved) ? saved : current.selectedClass,
        };
      },
    },
  ),
);
