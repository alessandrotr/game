import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MapAssetId } from '@arena/shared';
import { npcsForMap } from '../assets/data/npcs';
import { assets } from '../assets/registry';
import { CharacterModel } from '../render/CharacterModel';
import { getLocalRenderTransform } from '../store/localPlayer';
import { useInteractionStore } from '../store/interactionState';
import { nearestInteractable } from './interaction';

/**
 * Renders a map's interactable NPCs and runs proximity detection (Phase 8.3).
 * Each frame it finds the nearest in-range NPC to the local player and publishes
 * it to the interaction store (which drives the prompt + dialogue UI). NPCs are
 * client-side, interaction-only — no server entity needed.
 */
export function Npcs({ mapId }: { mapId: MapAssetId }) {
  const npcs = npcsForMap(mapId);
  const lastNearby = useRef<string | null>(null);

  useFrame(() => {
    const me = getLocalRenderTransform();
    if (!me.active) return;
    const near = nearestInteractable(me.x, me.z, npcs);
    const id = near?.id ?? null;
    if (id !== lastNearby.current) {
      lastNearby.current = id;
      useInteractionStore.getState().setNearby(id, near?.name ?? null);
    }
  });

  return (
    <>
      {npcs.map((npc) => (
        <group key={npc.id} position={npc.position} rotation={[0, npc.rotation ?? 0, 0]}>
          <CharacterModel descriptor={assets.getCharacter(npc.characterId)} />
          <InteractionRing npcId={npc.id} radius={npc.interactionRadius} />
        </group>
      ))}
    </>
  );
}

/** A ground ring marking an NPC's interaction range; brightens when in range. */
function InteractionRing({ npcId, radius }: { npcId: string; radius: number }) {
  const nearby = useInteractionStore((s) => s.nearbyNpcId === npcId);
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.15, radius, 40]} />
      <meshBasicMaterial
        color={nearby ? '#ffe08a' : '#5a6680'}
        transparent
        opacity={nearby ? 0.85 : 0.22}
      />
    </mesh>
  );
}
