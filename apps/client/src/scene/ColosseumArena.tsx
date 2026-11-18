import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { Mesh, Object3D, PointLight } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { COLOSSEUM_FLAMES } from '@arena/shared';
import { useQualityStore } from '../store/useQualityStore';

/**
 * The FFA / ranked arena: a Roman colosseum authored procedurally in Blender
 * (`tools/colosseum/gen.py`) and exported to `public/models/colosseum.glb` in game
 * coordinates (Y-up, 1 unit = 1 m, centred on the origin, sand floor radius 30).
 *
 * Collision is NOT read from the model: the solid cover + the circular wall ring
 * live in `generateArenaLayout` (packages/shared, from the generated
 * `colosseum.ts`) so the server, the predictor and this scene all agree. This
 * component is purely visual.
 *
 * Object groups in the glb: `Floor_*` (receive shadows only), `Shell` / `Gates` /
 * `Props` / `Banners` (cast + receive), `Flames` (emissive, no shadows).
 */
export const COLOSSEUM_URL = '/models/colosseum.glb';

const RECEIVE_ONLY = /^(Floor_|Dais)/;
const NO_SHADOW = /^Flames/;

function FlameLights() {
  const refs = useRef<(PointLight | null)[]>([]);
  const low = useQualityStore((s) => s.tier === 'low');
  const flames = useMemo(
    () => (low ? COLOSSEUM_FLAMES.filter((f) => f.big) : COLOSSEUM_FLAMES),
    [low],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flames.forEach((f, i) => {
      const l = refs.current[i];
      if (!l) return;
      // Layered sines read as a guttering flame without any per-frame allocation.
      const flick = 0.82 + 0.12 * Math.sin(t * 9.1 + i * 1.7) + 0.08 * Math.sin(t * 23.3 + i * 4.1);
      l.intensity = (f.big ? 16 : 6) * flick;
    });
  });
  return (
    <>
      {flames.map((f, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[f.x, f.y, f.z]}
          color="#ff9340"
          intensity={f.big ? 16 : 6}
          distance={f.big ? 22 : 12}
          decay={2}
        />
      ))}
    </>
  );
}

export function ColosseumArena() {
  const gltf = useGLTF(COLOSSEUM_URL);
  // Clone so the cached glTF scene stays pristine across room re-entries.
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);

  useEffect(() => {
    scene.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name;
      mesh.castShadow = !RECEIVE_ONLY.test(name) && !NO_SHADOW.test(name);
      mesh.receiveShadow = !NO_SHADOW.test(name);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      // Static, always-visible-ish scenery of one big piece: skip per-frame culling cost.
      mesh.frustumCulled = false;
    });
  }, [scene]);

  return (
    <group>
      <primitive object={scene} />
      <FlameLights />
    </group>
  );
}

useGLTF.preload(COLOSSEUM_URL);
