import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { ARENA_HALF_SIZE, TOWN_HALF_SIZE, type MapAssetId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { Arena } from './Arena';
import { TownGround } from './TownGround';
import { PlayerEntity } from './PlayerEntity';
import { Projectiles } from './Projectiles';
import { CameraRig } from './CameraRig';
import { MouseMove } from './MouseMove';
import { GroundTargeter } from './GroundTargeter';
import { CursorTracker } from './CursorTracker';
import { DestinationMarker } from './DestinationMarker';
import { Obstacles } from './Obstacles';
import { Portals } from './Portals';
import { MapView } from '../render/MapView';
import { MapZones } from '../render/MapZones';
import { VfxLayer } from '../render/VfxLayer';
import { FloatingCombatText } from '../render/FloatingCombatText';
import { Npcs } from './Npcs';

/**
 * Root R3F canvas. Renders the world for the current room — the combat arena or
 * the town hub — sharing the camera, movement, NPCs, zones, and portals; only
 * the arena mounts the combat layers (projectiles, combat text, targeting).
 */
export function GameScene() {
  const playerIds = useGameStore((s) => s.playerIds);
  const isArena = useGameStore((s) => s.room) === 'arena';

  const mapId: MapAssetId = isArena ? 'map.arena' : 'map.town';
  const half = isArena ? ARENA_HALF_SIZE : TOWN_HALF_SIZE;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 14, 12] }}
      gl={{ antialias: true }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={['#0b0d17']} />
      <fog attach="fog" args={['#0b0d17', half, half * 3]} />

      <ambientLight intensity={isArena ? 0.4 : 0.6} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
      />
      <Environment preset={isArena ? 'night' : 'sunset'} />

      {isArena ? (
        <>
          <Arena />
          <Obstacles />
        </>
      ) : (
        <TownGround />
      )}

      <MapView mapId={mapId} />
      <MapZones mapId={mapId} />
      <Npcs mapId={mapId} />
      <Portals mapId={mapId} />

      <MouseMove />
      {isArena && <CursorTracker />}
      {isArena && <GroundTargeter />}
      <DestinationMarker />

      {playerIds.map((id) => (
        <PlayerEntity key={id} sessionId={id} />
      ))}

      <VfxLayer />
      {isArena && (
        <>
          <Projectiles />
          <FloatingCombatText />
        </>
      )}

      <CameraRig />
    </Canvas>
  );
}
