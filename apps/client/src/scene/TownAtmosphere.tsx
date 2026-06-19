import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  Color,
  MathUtils,
  type AmbientLight,
  type BufferGeometry,
  type DirectionalLight,
  type Fog,
  type Group,
  type HemisphereLight,
  type LineBasicMaterial,
} from 'three';
import type { EnvConfig } from '../tuning/useEnvStore';
import { useFocusStore } from '../store/useFocusStore';
import { FOCUS_WEATHER, baseAtmosphere, type Atmosphere } from './weather';

interface QualityLike {
  shadows: boolean;
  fillLights: boolean;
  shadowMapSize: number;
}

/**
 * The town's animated sky + lighting. It renders the same background / fog / sun /
 * hemisphere lights as the base scene, but each frame it LERPS them toward the
 * active focus panel's {@link Atmosphere} (or back to the town's own look when no
 * focus is active) — so a cinematic focus brings its own weather in with the camera.
 * Focus state is read via getState (no React subscription) so the lerp isn't reset
 * by re-renders. The procedural IBL + fill/rim stay on the base look (cheap, subtle).
 */
export function TownAtmosphere({ env, quality }: { env: EnvConfig; quality: QualityLike }) {
  const bg = useRef<Color>(null);
  const fog = useRef<Fog>(null);
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const rain = useRef(0);

  const base = useMemo(() => baseAtmosphere(env), [env]);
  const tmp = useMemo(() => new Color(), []);

  // Seed the animated lights from the base env imperatively (and re-seed when the
  // env is dev-tuned). They take NO color/intensity props, so an unrelated
  // GameScene re-render (e.g. a player joining town) can't snap them back to base
  // mid-transition — only the per-frame lerp drives them.
  useLayoutEffect(() => {
    if (ambient.current) ambient.current.intensity = env.ambient;
    if (hemi.current) {
      hemi.current.color.set(env.hemiSky);
      hemi.current.groundColor.set(env.hemiGround);
      hemi.current.intensity = env.hemiIntensity;
    }
    if (sun.current) {
      sun.current.color.set(env.sunColor);
      sun.current.intensity = env.sunIntensity;
    }
  }, [env]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-2.5 * dt);
    const fs = useFocusStore.getState();
    const atm: Atmosphere = fs.target && fs.panel ? FOCUS_WEATHER[fs.panel] : base;

    if (bg.current) bg.current.lerp(tmp.set(atm.background), k);
    if (fog.current) {
      fog.current.color.lerp(tmp.set(atm.fogColor), k);
      fog.current.near = MathUtils.lerp(fog.current.near, env.fogNear * atm.fogNearMul, k);
      fog.current.far = MathUtils.lerp(fog.current.far, env.fogFar * atm.fogFarMul, k);
    }
    if (ambient.current) ambient.current.intensity = MathUtils.lerp(ambient.current.intensity, atm.ambient, k);
    if (hemi.current) {
      hemi.current.color.lerp(tmp.set(atm.hemiSky), k);
      hemi.current.groundColor.lerp(tmp.set(atm.hemiGround), k);
      hemi.current.intensity = MathUtils.lerp(hemi.current.intensity, atm.hemiIntensity, k);
    }
    if (sun.current) {
      sun.current.color.lerp(tmp.set(atm.sunColor), k);
      sun.current.intensity = MathUtils.lerp(sun.current.intensity, atm.sunIntensity, k);
    }
    rain.current = MathUtils.lerp(rain.current, atm.rain, k);
  });

  return (
    <>
      <color ref={bg} attach="background" args={[env.background]} />
      <fog ref={fog} attach="fog" args={[env.fogColor, env.fogNear, env.fogFar]} />

      {/* color/intensity are seeded + animated imperatively (see above), not via
          props, so React re-renders never reset the in-progress weather lerp. */}
      <ambientLight ref={ambient} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        key={quality.shadowMapSize}
        position={env.sunPosition}
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
      {quality.fillLights && (
        <>
          <directionalLight position={env.fillPosition} intensity={env.fillIntensity} color={env.fillColor} />
          <directionalLight position={env.rimPosition} intensity={env.rimIntensity} color={env.rimColor} />
        </>
      )}

      <Environment
        key={`${env.hemiSky}${env.sunColor}${env.hemiGround}`}
        frames={1}
        resolution={64}
        environmentIntensity={env.envIntensity}
      >
        <Lightformer form="rect" intensity={1.2} color={env.hemiSky} scale={[50, 50, 1]} position={[0, 14, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={2.2} color={env.sunColor} scale={[16, 16, 1]} position={[14, 9, 8]} rotation={[0, -Math.PI / 3, 0]} />
        <Lightformer form="rect" intensity={0.5} color={env.hemiGround} scale={[50, 50, 1]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </Environment>

      <Rain rainRef={rain} />
    </>
  );
}

/** Falling rain streaks (line segments) localized over the focused scene. Density
 *  is fixed; opacity + visibility track the lerped rain intensity, so it fades in
 *  with the storm and vanishes otherwise. The box follows the focus target. */
function Rain({ rainRef }: { rainRef: React.MutableRefObject<number> }) {
  const N = 700;
  const LEN = 0.5; // streak length
  const SPAN = 14; // half-extent of the rain box (x/z)
  const TOP = 16; // box height

  const group = useRef<Group>(null);
  const geo = useRef<BufferGeometry>(null);
  const mat = useRef<LineBasicMaterial>(null);

  const { positions, yy, vv } = useMemo(() => {
    const positions = new Float32Array(N * 6);
    const yy = new Float32Array(N);
    const vv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() * 2 - 1) * SPAN;
      const z = (Math.random() * 2 - 1) * SPAN;
      const y = Math.random() * TOP;
      yy[i] = y;
      vv[i] = 13 + Math.random() * 9;
      const o = i * 6;
      positions[o] = x;
      positions[o + 1] = y;
      positions[o + 2] = z;
      positions[o + 3] = x;
      positions[o + 4] = y - LEN;
      positions[o + 5] = z;
    }
    return { positions, yy, vv };
  }, []);

  useFrame((_, dt) => {
    const intensity = rainRef.current;
    if (mat.current) mat.current.opacity = intensity * 0.55;
    const g = group.current;
    if (g) {
      const t = useFocusStore.getState().target;
      if (t) {
        g.position.x = t.x;
        g.position.z = t.z;
      }
      g.visible = intensity > 0.02;
      if (!g.visible) return;
    }
    const arr = geo.current?.attributes.position?.array as Float32Array | undefined;
    if (!arr) return;
    for (let i = 0; i < N; i++) {
      let y = yy[i]! - vv[i]! * dt;
      if (y < 0) y += TOP;
      yy[i] = y;
      const o = i * 6;
      arr[o + 1] = y;
      arr[o + 4] = y - LEN;
    }
    geo.current!.attributes.position!.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <lineSegments raycast={() => null}>
        <bufferGeometry ref={geo}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={mat} color="#acc6ec" transparent opacity={0} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
