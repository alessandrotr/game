import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { ARENA_HALF_SIZE } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { Arena } from './Arena';
import { PlayerEntity } from './PlayerEntity';
import { Projectiles } from './Projectiles';
import { CameraRig } from './CameraRig';
import { MouseMove } from './MouseMove';
import { DestinationMarker } from './DestinationMarker';
import { Obstacles } from './Obstacles';
import { MapView } from '../render/MapView';
import { VfxLayer } from '../render/VfxLayer';

/** Root R3F canvas: lighting, arena, the camera rig, and one entity per player. */
export function GameScene() {
  const playerIds = useGameStore((s) => s.playerIds);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 14, 12] }}
      gl={{ antialias: true }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={['#0b0d17']} />
      <fog attach="fog" args={['#0b0d17', ARENA_HALF_SIZE, ARENA_HALF_SIZE * 3]} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-ARENA_HALF_SIZE}
        shadow-camera-right={ARENA_HALF_SIZE}
        shadow-camera-top={ARENA_HALF_SIZE}
        shadow-camera-bottom={-ARENA_HALF_SIZE}
      />
      <Environment preset="night" />

      <Arena />
      <Obstacles />
      <MapView mapId="map.arena" />
      <MouseMove />
      <DestinationMarker />
      {playerIds.map((id) => (
        <PlayerEntity key={id} sessionId={id} />
      ))}
      <Projectiles />
      <VfxLayer />

      <CameraRig />
    </Canvas>
  );
}
