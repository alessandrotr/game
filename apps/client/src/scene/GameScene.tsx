import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  type Material,
  type Mesh,
  type ToneMapping,
} from 'three';
import { type MapAssetId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useEnvStore, type ToneMappingMode } from '../tuning/useEnvStore';
import { Arena } from './Arena';
import { TownGround } from './TownGround';
import { TownLights } from './TownLights';
import { Fountain } from './Fountain';
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
      <ToneMap mode={env.toneMapping} exposure={env.exposure} />
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
      {/* Image-based lighting. Arena uses the night preset; the town builds a
          procedural dusk environment from its own tuned sky/sun/ground colours
          (zero external asset, baked once) for realistic ambient + reflections. */}
      {isArena ? (
        <Environment preset="night" environmentIntensity={env.envIntensity} />
      ) : (
        <Environment
          key={`${env.hemiSky}${env.sunColor}${env.hemiGround}`}
          frames={1}
          resolution={64}
          environmentIntensity={env.envIntensity}
        >
          <Lightformer
            form="rect"
            intensity={1.2}
            color={env.hemiSky}
            scale={[50, 50, 1]}
            position={[0, 14, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={2.2}
            color={env.sunColor}
            scale={[16, 16, 1]}
            position={[14, 9, 8]}
            rotation={[0, -Math.PI / 3, 0]}
          />
          <Lightformer
            form="rect"
            intensity={0.5}
            color={env.hemiGround}
            scale={[50, 50, 1]}
            position={[0, -10, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </Environment>
      )}

      {isArena ? (
        <>
          <Arena />
          <Obstacles />
        </>
      ) : (
        <>
          <TownGround />
          <TownLights />
          <Fountain position={[0, 0, -2]} />
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

const TONE_MAPPING: Record<ToneMappingMode, ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
};

/** Applies the tone-mapping operator + exposure live (the Canvas `gl` prop only
 *  sets these once, at creation). Changing the operator recompiles materials,
 *  since the tonemap is baked into each shader. */
function ToneMap({ mode, exposure }: { mode: ToneMappingMode; exposure: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    gl.toneMapping = TONE_MAPPING[mode];
    scene.traverse((o) => {
      const mat = (o as Mesh).material;
      if (!mat) return;
      (Array.isArray(mat) ? mat : [mat]).forEach((m: Material) => (m.needsUpdate = true));
    });
  }, [gl, scene, mode]);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}
