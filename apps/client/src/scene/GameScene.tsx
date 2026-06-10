import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { ARENA_HALF_SIZE, TOWN_HALF_SIZE, type MapAssetId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { Arena } from './Arena';
import { TownGround } from './TownGround';
import { TownLights } from './TownLights';
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
  // Tighten the shadow frustum to the area that actually has props. A smaller
  // frustum packs the 2048² map's texels onto that area → far crisper shadows
  // than spreading them over the whole ground. Town reaches back to the castle.
  const shadowExtent = isArena ? half : 30;
  // Fog: town fades the (huge) ground into the sky colour at the horizon, so the
  // ground edge is never a hard line. Kept clear over the town core.
  const fogNear = isArena ? half : half * 0.65;
  const fogFar = isArena ? half * 3 : half * 1.9;

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 14, 12] }}
      gl={{ antialias: true }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Arena: moody dark. Town: warm dusk so the lit lamps, windows, and forge
          glow read against a low-key sky. */}
      <color attach="background" args={[isArena ? '#0b0d17' : '#4f4a66']} />
      <fog attach="fog" args={[isArena ? '#0b0d17' : '#4f4a66', fogNear, fogFar]} />

      {/* Fill is kept low so the sunset sun + lamp pools read with contrast. */}
      <ambientLight intensity={isArena ? 0.4 : 0.16} />
      {/* Outdoor sky/ground fill — carries the town's ambient (no IBL there). */}
      {!isArena && <hemisphereLight color="#6d72a4" groundColor="#40382a" intensity={0.5} />}
      <directionalLight
        position={isArena ? [10, 20, 10] : [16, 15, 9]}
        intensity={isArena ? 1.1 : 1.15}
        color={isArena ? '#ffffff' : '#ffc078'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
      />
      {/* IBL only in the arena; the town is lit by sun + hemisphere + its lamps. */}
      {isArena && <Environment preset="night" />}

      {isArena ? (
        <>
          <Arena />
          <Obstacles />
        </>
      ) : (
        <>
          <TownGround />
          <TownLights />
        </>
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
