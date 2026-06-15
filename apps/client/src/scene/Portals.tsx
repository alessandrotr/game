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
/** A portal's visual + travel intent, derived from the zone and current world. */
type PortalStyle = {
  label: string;
  core: string;
  edge: string;
  glow: string;
  labelColor: string;
  travel: () => void;
};

/** Color/label schemes per destination. The town↔arena gate flips by current
 *  world; the zombie gate is its own sickly-green gateway. */
function portalStyle(zone: { mode?: 'zombie' }, room: RoomType | null): PortalStyle {
  if (zone.mode === 'zombie') {
    return {
      label: 'Zombie Mode',
      core: '#d8ffb0',
      edge: '#3a7d1f',
      glow: '#7fe04a',
      labelColor: '#a6ff7f',
      travel: () => void travelTo('arena', { zombie: true }),
    };
  }
  // Town leads to the arena (cyan moongate); the arena leads back to town
  // (warm amber gate).
  const target: RoomType = room === 'arena' ? 'town' : 'arena';
  const toArena = target === 'arena';
  return {
    label: toArena ? 'Enter Arena' : 'Return to Town',
    core: toArena ? '#cdeeff' : '#ffe6b0',
    edge: toArena ? '#1f6fe0' : '#d8861f',
    glow: toArena ? '#36b6ff' : '#ffb24a',
    labelColor: toArena ? '#7fd6ff' : '#ffcf8a',
    travel: () => void travelTo(target),
  };
}

export function Portals({ mapId }: { mapId: MapAssetId }) {
  const room = useGameStore((s) => s.room);
  const map = assets.getMap(mapId);
  if (!map?.zones) return null;

  return (
    <>
      {map.zones
        .filter((z) => z.kind === 'portal')
        .map((zone, i) => {
          const style = portalStyle(zone, room);
          return (
            // Key by world so travel remounts a fresh portal — the Canvas persists
            // across town↔arena, and reusing the same instance (plain index key)
            // left the shader's animated uniforms in a stale, frozen state.
            <group key={`${room}-${i}`} position={zone.center}>
              {/* Animated shader portal (visual). */}
              <PortalEffect radius={1.7} core={style.core} edge={style.edge} />
              {/* A soft light so the gateway casts a glow on the arch and ground. */}
              <pointLight
                position={[0, 1.8, 0.4]}
                color={style.glow}
                intensity={9}
                distance={9}
                decay={2}
              />

              {/* Clickable pad (invisible) covering the gateway. */}
              <mesh
                position={[0, 1, 0]}
                onPointerDown={(e) => {
                  if (e.nativeEvent.button !== 0) return;
                  e.stopPropagation();
                  style.travel();
                }}
              >
                <cylinderGeometry args={[zone.radius, zone.radius, 2.4, 24]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Billboard position={[0, 3.7, 0]}>
                <Text
                  fontSize={0.4}
                  color={style.labelColor}
                  anchorX="center"
                  anchorY="bottom"
                  outlineWidth={0.025}
                  outlineColor="#000000"
                >
                  {style.label}
                </Text>
              </Billboard>
            </group>
          );
        })}
    </>
  );
}
