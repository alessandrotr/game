import { memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { useEnvStore } from '../tuning/useEnvStore';
import { MapView } from '../render/MapView';
import { TownGround } from './TownGround';
import { TownLights } from './TownLights';
import { Fountain } from './Fountain';

/**
 * A decorative, slowly-orbiting view of the town hub — no players, NPCs, camera
 * rig, or connection. Rendered behind the auth and character-select screens as a
 * live backdrop (an "attract mode") in place of the flat radial gradient. Reuses
 * the same static town pieces + env tuning as {@link GameScene} so it matches the
 * real world the player is about to enter.
 */

/** Slow cinematic orbit around the fountain, independent of React/state. */
function OrbitCamera() {
  const camera = useThree((s) => s.camera);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.04;
    camera.position.set(Math.sin(t) * 16, 8.5, Math.cos(t) * 16 - 2);
    camera.lookAt(0, 1.5, -2);
  });
  return null;
}

function TownBackdropImpl() {
  const env = useEnvStore((s) => s.town);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ fov: 55, near: 0.1, far: 200, position: [0, 8.5, 14] }}
        gl={{ antialias: false }}
      >
        <color attach="background" args={[env.background]} />
        <fog attach="fog" args={[env.fogColor, env.fogNear, env.fogFar]} />

        <ambientLight intensity={env.ambient} />
        <hemisphereLight
          color={env.hemiSky}
          groundColor={env.hemiGround}
          intensity={env.hemiIntensity}
        />
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
        <directionalLight
          position={env.fillPosition}
          intensity={env.fillIntensity}
          color={env.fillColor}
        />
        <directionalLight
          position={env.rimPosition}
          intensity={env.rimIntensity}
          color={env.rimColor}
        />

        {/* Procedural dusk IBL (no external asset), matching the live town. */}
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

        <TownGround />
        <TownLights />
        <Fountain position={[0, 0, -2]} />
        <MapView mapId="map.town" />

        <OrbitCamera />
      </Canvas>
    </div>
  );
}

/** Memoized: its own render loop drives the orbit, so it never needs to
 *  reconcile when the surrounding auth/select React tree re-renders. */
export const TownBackdrop = memo(TownBackdropImpl);
