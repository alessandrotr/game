import { Text } from '@react-three/drei';
import type { MapAssetId, MapZoneKind } from '@arena/shared';
import { assets } from '../assets/registry';

/** Ground-marker tint per zone kind. */
const ZONE_COLOR: Record<MapZoneKind, string> = {
  spawn: '#5fd07a',
  npc: '#ffd86b',
  shop: '#9b8cff',
  portal: '#22c8ff',
};

/**
 * Renders a map's semantic zones (Phase 8.1) as subtle ground rings with labels
 * — the visible output of the town/arena builders' layout. Primitive-only, so
 * it maps cleanly onto real art later (decals, banners, etc.).
 */
export function MapZones({ mapId }: { mapId: MapAssetId }) {
  const map = assets.getMap(mapId);
  if (!map?.zones?.length) return null;

  return (
    <group>
      {map.zones.map((zone, i) => {
        const color = ZONE_COLOR[zone.kind];
        return (
          <group key={`${zone.kind}:${i}`} position={zone.center}>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[Math.max(0.1, zone.radius - 0.25), zone.radius, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0.35} />
            </mesh>
            {zone.label && (
              <Text
                position={[0, 0.05, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.7}
                color={color}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor="#000000"
              >
                {zone.label}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}
