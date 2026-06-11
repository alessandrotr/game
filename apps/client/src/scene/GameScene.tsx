import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { type MapAssetId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useEnvStore } from '../tuning/useEnvStore';
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
  const room = isArena ? 'arena' : 'town';
  const mapId: MapAssetId = isArena ? 'map.arena' : 'map.town';
  // Lighting / shadows / fog / tone, live-tunable per world via the dev tools
  // (Leva → "Environment · Town/Arena"). Defaults match the hand-tuned look.
  const env = useEnvStore((s) => s[room]);

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 14, 12] }}
      gl={{ antialias: true }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ToneExposure value={env.exposure} />
      <color attach="background" args={[env.background]} />
      <fog attach="fog" args={[env.fogColor, env.fogNear, env.fogFar]} />

      <ambientLight intensity={env.ambient} />
      {/* Outdoor sky/ground fill (intensity 0 in the arena, which uses IBL). */}
      <hemisphereLight
        color={env.hemiSky}
        groundColor={env.hemiGround}
        intensity={env.hemiIntensity}
      />
      {/* Key light (sun) — the only shadow caster. Keyed by map size so changing
          it from the dev tools recreates a fresh shadow map. */}
      <directionalLight
        key={env.shadowMapSize}
        position={env.sunPosition}
        intensity={env.sunIntensity}
        color={env.sunColor}
        castShadow
        shadow-mapSize={[env.shadowMapSize, env.shadowMapSize]}
        shadow-bias={env.shadowBias}
        shadow-normalBias={env.shadowNormalBias}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-env.shadowExtent}
        shadow-camera-right={env.shadowExtent}
        shadow-camera-top={env.shadowExtent}
        shadow-camera-bottom={-env.shadowExtent}
      />
      {/* Shadowless cinematic fill + rim (cheap): lift shadowed faces and
          separate silhouettes from the background. */}
      <directionalLight position={env.fillPosition} intensity={env.fillIntensity} color={env.fillColor} />
      <directionalLight position={env.rimPosition} intensity={env.rimIntensity} color={env.rimColor} />
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

/** Applies tone-mapping exposure live, so the dev-tools slider takes effect
 *  (the Canvas `gl` prop only sets it once, at creation). */
function ToneExposure({ value }: { value: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}
