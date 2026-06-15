import { useMemo } from 'react';
import { DEFAULT_ARENA_SEED, generateArenaLayout, type GeneratedArenaLayout } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/**
 * The current match's procedural arena layout (cover obstacles + props), rebuilt
 * from the server-synced seed. Same generator the server runs, so the client
 * renders and predicts against the exact geometry the server collides against.
 * Falls back to a default seed for the brief moment before the seed arrives.
 */
export function useArenaLayout(): GeneratedArenaLayout {
  const seed = useGameStore((s) => s.arenaSeed) || DEFAULT_ARENA_SEED;
  // Must match the server's flag so client and server rebuild the identical
  // layout (zombie mode adds trailers/drums and clears the flank portals).
  const zombieMode = useGameStore((s) => s.zombieMode);
  return useMemo(() => generateArenaLayout(seed, zombieMode), [seed, zombieMode]);
}
