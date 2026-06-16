import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Billboard, Text } from '@react-three/drei';
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
/** Beyond this distance an NPC is hidden — fog already hides it, and not
 *  rendering it skips the per-frame skinning cost of an off-screen character. */
const NPC_CULL_DIST = 45;

export function Npcs({ mapId }: { mapId: MapAssetId }) {
  const npcs = npcsForMap(mapId);
  const lastNearby = useRef<string | null>(null);
  const refs = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const me = getLocalRenderTransform();
    if (!me.active) return;
    const near = nearestInteractable(me.x, me.z, npcs);
    const id = near?.id ?? null;
    if (id !== lastNearby.current) {
      lastNearby.current = id;
      useInteractionStore.getState().setNearby(id, near?.name ?? null);
    }
    // Hide distant NPCs so their skinned models aren't skinned/rendered off-screen.
    for (let i = 0; i < npcs.length; i++) {
      const g = refs.current[i];
      const n = npcs[i];
      if (!g || !n) continue;
      const dx = n.position[0] - me.x;
      const dz = n.position[2] - me.z;
      g.visible = dx * dx + dz * dz < NPC_CULL_DIST * NPC_CULL_DIST;
    }
  });

  return (
    <>
      {npcs.map((npc, i) => (
        <group
          key={npc.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={npc.position}
          rotation={[0, npc.rotation ?? 0, 0]}
        >
          <CharacterModel descriptor={assets.getCharacter(npc.characterId)} />
          <InteractionRing npcId={npc.id} radius={npc.interactionRadius} />
          {/* Floating name, like players (counter-rotated via billboard). */}
          <Billboard position={[0, 2.3, 0]}>
            <Text
              fontSize={0.3}
              color="#ffe2a8"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              {npc.name}
            </Text>
          </Billboard>
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
      <ringGeometry args={[radius - 0.15, radius, 24]} />
      <meshBasicMaterial
        color={nearby ? '#ffe08a' : '#5a6680'}
        transparent
        opacity={nearby ? 0.85 : 0.22}
      />
    </mesh>
  );
}
