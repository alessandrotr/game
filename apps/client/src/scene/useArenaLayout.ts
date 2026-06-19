import { useMemo } from 'react';
import {
  DEFAULT_ARENA_SEED,
  generateArenaLayout,
  generateRoomLayout,
  generateSectionCover,
  type GeneratedArenaLayout,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

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
      (window as any).__arenaRoomLayout = null;
      return base;
    }

    // Cache the room layout on window for the PlayerEntity prediction clamp.
    const roomLayout = generateRoomLayout(seed);
    (window as any).__arenaRoomLayout = roomLayout;

    if (unlockedSections <= 0) return base;

    // Generate cover for each unlocked section and merge into the layout.
    const mergedProps = [...base.props];
    const mergedObstacles = [...base.obstacles];

    for (let i = 0; i < unlockedSections && i < roomLayout.sections.length; i++) {
      const section = roomLayout.sections[i]!;
      const sectionCover = generateSectionCover(seed, section);
      // Merge the section's cover structures as obstacles (for minimap circles).
      for (const s of sectionCover.structures) {
        mergedObstacles.push({
          x: s.x,
          z: s.z,
          radius: s.radius,
          height: s.height,
        });
      }
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
