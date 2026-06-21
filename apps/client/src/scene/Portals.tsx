import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import {
  ZOMBIE_FLANK_PORTALS,
  generateRoomLayout,
  type MapAssetId,
  type SpawnPoint,
} from '@arena/shared';
import { assets } from '../assets/registry';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { useFocusStore } from '../store/useFocusStore';
import { travelTo } from '../network/colyseus';
import { PortalEffect } from './PortalEffect';
import { FadeGroup } from './FadeGroup';

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
function portalStyle(zone: { mode?: 'zombie' | 'gunzombie' }, room: RoomType | null): PortalStyle {
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
  if (zone.mode === 'gunzombie') {
    // A steely gunmetal-orange gate to set it apart from the green horde portal.
    return {
      label: 'Gun Mode Zombie',
      core: '#ffd9a8',
      edge: '#8a3b12',
      glow: '#ff7a2f',
      labelColor: '#ffb066',
      travel: () => void travelTo('arena', { gun: true }),
    };
  }
  // Town leads to the arena (cyan moongate); the arena leads back to town
  // (warm amber gate).
  const target: RoomType = room === 'arena' ? 'town' : 'arena';
  const toArena = target === 'arena';
  return {
    label: toArena ? 'Free for all Arena' : 'Return to Town',
    core: toArena ? '#cdeeff' : '#ffe6b0',
    edge: toArena ? '#1f6fe0' : '#d8861f',
    glow: toArena ? '#36b6ff' : '#ffb24a',
    labelColor: toArena ? '#7fd6ff' : '#ffcf8a',
    travel: () => void travelTo(target),
  };
}

export function Portals({ mapId }: { mapId: MapAssetId }) {
  const room = useGameStore((s) => s.room);
  const zombieMode = useGameStore((s) => s.zombieMode);
  const arenaSeed = useGameStore((s) => s.arenaSeed);
  const unlockedSections = useGameStore((s) => s.unlockedSections);

  // Recede the travel gateways while a town structure is cinematically focused.
  const show = useFocusStore((s) => !s.target);
  const map = assets.getMap(mapId);
  // Zombie mode: the flanking side portals the hordes pour out of — purely visual
  // sickly-green gateways (not clickable; the back gate stays the travel portal).
  const showFlankPortals = zombieMode && mapId === 'map.arena';

  const roomLayout = useMemo(() => {
    if (!zombieMode || !arenaSeed) return null;
    return generateRoomLayout(arenaSeed);
  }, [zombieMode, arenaSeed]);

  const sectionPortals = useMemo(() => {
    if (!zombieMode || mapId !== 'map.arena' || !roomLayout) return [];
    const portals: SpawnPoint[] = [];
    for (let i = 0; i < unlockedSections && i < roomLayout.sections.length; i++) {
      const section = roomLayout.sections[i];
      if (section) {
        portals.push(...section.portalPoints);
      }
    }
    return portals;
  }, [zombieMode, mapId, roomLayout, unlockedSections]);

  if (!map?.zones && !showFlankPortals && sectionPortals.length === 0) return null;

  return (
    <FadeGroup show={show}>
      {showFlankPortals &&
        ZOMBIE_FLANK_PORTALS.map((p, i) => (
          <group key={`flank-${i}`} position={[p.x, 0, p.z]}>
            <PortalEffect radius={1.5} core="#d8ffb0" edge="#3a7d1f" />
            <pointLight
              position={[0, 1.8, 0]}
              color="#7fe04a"
              intensity={8}
              distance={8}
              decay={2}
            />
          </group>
        ))}
      {zombieMode &&
        sectionPortals.map((p, i) => (
          <group key={`section-portal-${i}`} position={[p.x, 0, p.z]}>
            <PortalEffect radius={1.5} core="#d8ffb0" edge="#3a7d1f" />
          </group>
        ))}
      {map?.zones
        ?.filter((z) => z.kind === 'portal')
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
    </FadeGroup>
  );
}
