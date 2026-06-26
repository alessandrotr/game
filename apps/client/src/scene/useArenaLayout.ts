import { useMemo } from 'react';
import {
  DEFAULT_ARENA_SEED,
  generateArenaLayout,
  generateRoomLayout,
  generateSectionCover,
  trapForSection,
  type GeneratedArenaLayout,
  type RoomLayout,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

declare global {
  interface Window {
    /** The current zombie-mode room layout, cached for PlayerEntity's prediction
     *  clamp (read in `useFrame`, where a hook call isn't possible). Null when not
     *  in zombie mode. */
    __arenaRoomLayout: RoomLayout | null;
  }
}

/**
 * The current match's procedural arena layout (cover obstacles + props), rebuilt
 * from the server-synced seed. Same generator the server runs, so the client
 * renders and predicts against the exact geometry the server collides against.
 * Falls back to a default seed for the brief moment before the seed arrives.
 *
 * When the room expansion system is active (zombie mode), section cover for
 * unlocked sections is generated and merged into the layout so the client
 * renders props (trailers, drums, etc.) for each opened section.
 */
export function useArenaLayout(): GeneratedArenaLayout {
  const seed = useGameStore((s) => s.arenaSeed) || DEFAULT_ARENA_SEED;
  // Must match the server's flag so client and server rebuild the identical
  // layout (zombie mode adds trailers/drums and clears the flank portals).
  const zombieMode = useGameStore((s) => s.zombieMode);
  const unlockedSections = useGameStore((s) => s.unlockedSections);

  return useMemo(() => {
    const base = generateArenaLayout(seed, zombieMode);
    if (!zombieMode) {
      // Clear the cached layout when not in zombie mode.
      window.__arenaRoomLayout = null;
      return base;
    }

    // Cache the room layout on window for the PlayerEntity prediction clamp.
    const roomLayout = generateRoomLayout(seed);
    window.__arenaRoomLayout = roomLayout;

    if (unlockedSections <= 0) return base;

    // Generate cover for each unlocked section and merge into the layout.
    const mergedProps = [...base.props];
    const mergedObstacles = [...base.obstacles];

    for (let i = 0; i < unlockedSections && i < roomLayout.sections.length; i++) {
      const section = roomLayout.sections[i]!;
      // Mirror the server: reserve the trap's area so decor placement matches.
      const trap = trapForSection(seed, section);
      const sectionCover = generateSectionCover(seed, section, trap);
      // NOTE: section cover *structures* (cars/trailers/dumpsters) are NOT added
      // to layoutObstacles here. They're already tracked dynamically via the
      // Zustand store's `structureObstacles` (which updates when a car rolls or
      // a structure crumbles). Adding them here too would create a phantom
      // collision circle stuck at the structure's original spawn position.
      // Merge the section's decorative props.
      mergedProps.push(...sectionCover.props);
    }

    return {
      ...base,
      obstacles: mergedObstacles,
      props: mergedProps,
    };
  }, [seed, zombieMode, unlockedSections]);
}
