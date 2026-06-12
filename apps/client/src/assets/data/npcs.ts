import type { CharacterAssetId, MapAssetId, Vec3 } from '@arena/shared';
import type { DialogueId } from './dialogues';

/**
 * Interactable NPCs, placed per map. This is the single source for both
 * rendering (the `Npcs` layer draws each via its character asset) and
 * interaction (the proximity/dialogue system reads position + radius + dialogue)
 * — so an NPC's look, location, and conversation never drift apart.
 */
export interface NpcInstance {
  /** Unique within the game (used as the interaction key). */
  id: string;
  /** Display name (prompt + dialogue speaker fallback). */
  name: string;
  characterId: CharacterAssetId;
  position: Vec3;
  /** Facing, Y radians. */
  rotation?: number;
  dialogueId: DialogueId;
  /** How close the player must be to interact, in world units. */
  interactionRadius: number;
}

export const MAP_NPCS: Partial<Record<MapAssetId, NpcInstance[]>> = {
  'map.arena': [],
  'map.town': [],
};

export function npcsForMap(mapId: MapAssetId): NpcInstance[] {
  return MAP_NPCS[mapId] ?? [];
}

const NPC_BY_ID = new Map<string, NpcInstance>(
  Object.values(MAP_NPCS)
    .flat()
    .filter((n): n is NpcInstance => Boolean(n))
    .map((n) => [n.id, n]),
);

export function findNpcById(id: string): NpcInstance | undefined {
  return NPC_BY_ID.get(id);
}
