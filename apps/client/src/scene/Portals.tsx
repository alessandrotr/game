import { Billboard, Text } from '@react-three/drei';
import type { MapAssetId } from '@arena/shared';
import { assets } from '../assets/registry';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { travelTo } from '../network/colyseus';

/**
 * Clickable portals (Phase 10): each map's `portal` zone becomes a clickable pad
 * that travels to the other world (town ↔ arena). Click avoids clashing with the
 * F-to-talk NPC key, since arena guards stand right by the portal.
 */
export function Portals({ mapId }: { mapId: MapAssetId }) {
  const room = useGameStore((s) => s.room);
  const map = assets.getMap(mapId);
  if (!map?.zones) return null;

  // Town leads to the arena; the arena leads back to town.
  const target: RoomType = room === 'arena' ? 'town' : 'arena';
  const label = target === 'arena' ? 'Enter Arena' : 'Return to Town';

  return (
    <>
      {map.zones
        .filter((z) => z.kind === 'portal')
        .map((zone, i) => (
          <group key={i} position={zone.center}>
            {/* Clickable pad. */}
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
            <Billboard position={[0, 2.8, 0]}>
              <Text
                fontSize={0.4}
                color="#22c8ff"
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
