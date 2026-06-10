import { Billboard, Text } from '@react-three/drei';
import type { MapAssetId } from '@arena/shared';
import { assets } from '../assets/registry';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { travelTo } from '../network/colyseus';
import { PortalEffect } from './PortalEffect';

/**
 * Clickable portals (Phase 10): each map's `portal` zone becomes a clickable pad
 * that travels to the other world (town ↔ arena). Click avoids clashing with the
 * F-to-talk NPC key, since arena guards stand right by the portal.
 */
export function Portals({ mapId }: { mapId: MapAssetId }) {
  const room = useGameStore((s) => s.room);
  const map = assets.getMap(mapId);
  if (!map?.zones) return null;

  // Town leads to the arena (cyan moongate); the arena leads back to town
  // (warm amber gate).
  const target: RoomType = room === 'arena' ? 'town' : 'arena';
  const label = target === 'arena' ? 'Enter Arena' : 'Return to Town';
  const toArena = target === 'arena';
  const core = toArena ? '#cdeeff' : '#ffe6b0';
  const edge = toArena ? '#1f6fe0' : '#d8861f';
  const glow = toArena ? '#36b6ff' : '#ffb24a';
  const labelColor = toArena ? '#7fd6ff' : '#ffcf8a';

  return (
    <>
      {map.zones
        .filter((z) => z.kind === 'portal')
        .map((zone, i) => (
          <group key={i} position={zone.center}>
            {/* Animated shader portal (visual). */}
            <PortalEffect radius={1.7} core={core} edge={edge} />
            {/* A soft light so the gateway casts a glow on the arch and ground. */}
            <pointLight position={[0, 1.8, 0.4]} color={glow} intensity={9} distance={9} decay={2} />

            {/* Clickable pad (invisible) covering the gateway. */}
            <mesh
              position={[0, 1, 0]}
              onPointerDown={(e) => {
                if (e.nativeEvent.button !== 0) return;
                e.stopPropagation();
                void travelTo(target);
              }}
            >
              <cylinderGeometry args={[zone.radius, zone.radius, 2.4, 24]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Billboard position={[0, 3.4, 0]}>
              <Text
                fontSize={0.4}
                color={labelColor}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.025}
                outlineColor="#000000"
              >
                {label}
              </Text>
            </Billboard>
          </group>
        ))}
    </>
  );
}
