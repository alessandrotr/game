import { useEffect, useMemo, useState } from 'react';
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
import { useCustomizeStore } from '../store/useCustomizeStore';
import { useQualityStore } from '../store/useQualityStore';
import { useEnvStore, type ToneMappingMode } from '../tuning/useEnvStore';
import { Arena } from './Arena';
import { TownGround } from './TownGround';
import { TownLights } from './TownLights';
import { Fountain } from './Fountain';
import { TownLeaderboardTablet } from './TownLeaderboardTablet';
import { TownPodiums } from './TownPodiums';
import { TownDuelAltar } from './TownDuelAltar';
import { TownBreachRift } from './TownBreachRift';
import { PlayerEntity } from './PlayerEntity';
import { BarrelEntity } from './BarrelEntity';
import { DestructibleEntity } from './DestructibleEntity';
import { CoverStructureEntity } from './CoverStructureEntity';
import { Projectiles } from './Projectiles';
import { Pickables } from './Pickables';
import { GroundZones } from './GroundZones';
import { CameraRig } from './CameraRig';
import { CameraControls } from './CameraControls';
import { PerfMeter } from './PerfMeter';
import { MouseMove } from './MouseMove';
import { GunControls } from './GunControls';
import { GroundTargeter } from './GroundTargeter';
import { StatusIndicators } from './StatusIndicators';
import { ChannelBeams, ChannelAim, FieldAuras } from './ChannelBeams';
import { CursorTracker } from './CursorTracker';
import { DestinationMarker } from './DestinationMarker';
import { ArenaLights } from './ArenaLights';
import { Portals } from './Portals';
import { MapView } from '../render/MapView';
import { Castle } from './Castle';
import { useArenaLayout } from './useArenaLayout';
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
  const barrelIds = useGameStore((s) => s.barrelIds);
  const destructibleIds = useGameStore((s) => s.destructibleIds);
  const structureIds = useGameStore((s) => s.structureIds);
  const isArena = useGameStore((s) => s.room) === 'arena';
  // Gun Mode Zombie swaps the point-to-move input for WASD + mouse-aim + fire.
  const gunMode = useGameStore((s) => s.gunMode);
  const gunView = useGameStore((s) => s.gunView);
  // First person hides the cursor (pointer lock); top-down still cursor-aims.
  const fpsView = gunMode && gunView === 'fps';
  const room = isArena ? 'arena' : 'town';
  const mapId: MapAssetId = isArena ? 'map.arena' : 'map.town';
  // The match's procedural cover (static props). Burning barrels are NOT here —
  // they're live, destructible entities rendered from replicated state below.
  const arenaLayout = useArenaLayout();
  // Fixed barrel roster (b0…bN-1) for the match — drives a stable fire-light pool
  // so detonations don't change the scene's light count (which would recompile
  // every material and hitch the frame).
  const barrelRoster = useMemo(
    () => arenaLayout.barrels.map((_, i) => `b${i}`),
    [arenaLayout],
  );
  // Lighting / shadows / fog / tone, live-tunable per world via the dev tools
  // (Leva → "Environment · Town/Arena"). Defaults match the hand-tuned look.
  const env = useEnvStore((s) => s[room]);

  // Graphics quality (auto-detected + user-overridable) scales the heavy levers:
  // resolution, shadows, shadow-map size, and the cosmetic fill lights.
  const tier = useQualityStore((s) => s.tier);
  const quality = useQualityStore((s) => s.settings);

  return (
    <Canvas
      // Remount cleanly when the quality tier changes (rare) so shadow on/off and
      // resolution take full effect without stale shader programs.
      key={tier}
      // PCF (not the more expensive PCFSoft) — lighter shadow filtering. Off on Low.
      shadows={quality.shadows ? 'percentage' : false}
      // Resolution scales with quality: Low caps at 1.0 (halves fragment work on
      // Retina), High allows up to 1.5×. The fixed cap was the main GPU lever.
      dpr={quality.dpr}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 14, 12] }}
      // MSAA off: with the dpr supersampling already smoothing edges, MSAA is
      // mostly redundant GPU work (multiplied per fragment on high-DPI).
      gl={{ antialias: false }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ToneMap mode={env.toneMapping} exposure={env.exposure} />
      <ContextGuard />
      <PauseWhileCovered />
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
        key={quality.shadowMapSize}
        position={env.sunPosition}
        intensity={env.sunIntensity}
        color={env.sunColor}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={env.shadowBias}
        shadow-normalBias={env.shadowNormalBias}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-env.shadowExtent}
        shadow-camera-right={env.shadowExtent}
        shadow-camera-top={env.shadowExtent}
        shadow-camera-bottom={-env.shadowExtent}
      />
      {/* Shadowless cinematic fill + rim: lift shadowed faces and separate
          silhouettes. Dropped on Low to save the per-pixel lighting work. */}
      {quality.fillLights && (
        <>
          <directionalLight position={env.fillPosition} intensity={env.fillIntensity} color={env.fillColor} />
          <directionalLight position={env.rimPosition} intensity={env.rimIntensity} color={env.rimColor} />
        </>
      )}
      {/* Image-based lighting. Arena uses the night preset; the town builds a
          procedural dusk environment from its own tuned sky/sun/ground colours
          (zero external asset, baked once) for realistic ambient + reflections. */}
      {isArena ? (
        <Environment preset="warehouse" environmentIntensity={env.envIntensity} />
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
          <ArenaLights barrelIds={barrelRoster} />
        </>
      ) : (
        <>
          <TownGround />
          <TownLights />
          <Fountain position={[0, 0, -2]} />
          <TownLeaderboardTablet />
          <TownPodiums />
          <TownDuelAltar />
          <TownBreachRift />
        </>
      )}

      <MapView
        mapId={mapId}
        props={isArena ? arenaLayout.props : undefined}
        exclude={isArena ? undefined : ['prop.castle']}
      />
      {/* The castle is rendered apart so it can open up (hide near walls/roofs)
          when the player walks inside the courtyard. */}
      {!isArena && <Castle />}
      <MapZones mapId={mapId} />
      <Npcs mapId={mapId} />
      <Portals mapId={mapId} />

      <PerfMeter />
      {gunMode ? <GunControls /> : <MouseMove />}
      <CameraControls />
      {isArena && !fpsView && <CursorTracker />}
      {isArena && !gunMode && <GroundTargeter />}
      {!gunMode && <DestinationMarker />}

      {playerIds.map((id) => (
        <PlayerEntity key={id} sessionId={id} />
      ))}

      {isArena &&
        barrelIds.map((id) => <BarrelEntity key={id} barrelId={id} />)}

      {isArena &&
        destructibleIds.map((id) => <DestructibleEntity key={id} destructibleId={id} />)}

      {isArena &&
        structureIds.map((id) => <CoverStructureEntity key={id} structureId={id} />)}

      {isArena && <Pickables />}
      {isArena && <GroundZones />}

      <VfxLayer />
      {isArena && (
        <>
          <Projectiles />
          <StatusIndicators />
          <ChannelBeams />
          <ChannelAim />
          <FieldAuras />
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

/**
 * Survive a WebGL context loss instead of letting it cascade into a disconnect.
 *
 * When the GPU drops the context (driver reset, a long frame tripping the
 * watchdog, the tab being backgrounded), the browser fires `webglcontextlost`.
 * If nothing calls `preventDefault()`, the loss is treated as PERMANENT — the
 * renderer then errors on its next frame, the error boundary catches it, and the
 * session tears down to the join screen. Calling `preventDefault()` instead tells
 * the browser we'll recover, so it fires `webglcontextrestored`; Three.js
 * re-initializes the GL state and rendering resumes in place.
 */
function ContextGuard() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      console.warn('[gl] WebGL context lost — awaiting restore');
    };
    const onRestored = () => console.warn('[gl] WebGL context restored');
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl]);
  return null;
}

/**
 * Pause the world's render loop while a full-screen modal (the Champion /
 * customize hub) covers it. That overlay is an opaque blurred backdrop — the
 * scene behind it is invisible — yet the canvas would otherwise keep drawing
 * shadows, IBL and every entity at 60fps, burning GPU that the modal's own 3D
 * canvases (avatar showcase + thumbnails) are competing for. Since the client
 * never simulates (state is server-authoritative and keeps arriving over the
 * network regardless of rendering), freezing the loop changes nothing visible
 * and nothing about game state; on close we resume `'always'` and the next
 * frame snaps to the latest server state behind the closing dialog.
 */
function PauseWhileCovered() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const covered = useCustomizeStore((s) => s.open);
  // Also pause when the browser tab is hidden — no reason to render an unfocused
  // tab at 60fps. The view snaps to the latest server state when it returns.
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    setFrameloop(covered || hidden ? 'never' : 'always');
    return () => setFrameloop('always');
  }, [covered, hidden, setFrameloop]);
  return null;
}

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
