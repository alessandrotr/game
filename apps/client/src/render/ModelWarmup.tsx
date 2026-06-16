import { useMemo } from 'react';
import { Preload, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * GPU warm-up for heavy models. `useGLTF.preload` only fetches + parses a GLB;
 * the costly part — uploading its textures to the GPU and compiling its shader —
 * still happens on the FIRST on-screen render, which is what hitches the frame
 * when the first zombie wave spawns mid-combat.
 *
 * This mounts a hidden, far-off clone of each model and runs drei's
 * `<Preload all />` (a `gl.compile` pass), so the upload + compile happen up
 * front (during the match-load transition) instead of during gameplay. Clones
 * share their materials/geometry with the cached template, so warming these
 * warms the real spawns too. Stays mounted (culled, ~free) for the session.
 */
function WarmSkin({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // Clone like the real characters do (shared materials/geometry, own skeleton),
  // so disposal is safe and the warmed materials are the ones spawns reuse.
  const instance = useMemo(() => cloneSkinned(scene), [scene]);
  return <primitive object={instance} />;
}

export function ModelWarmup({ urls }: { urls: readonly string[] }) {
  return (
    <group position={[0, -1000, 0]}>
      {urls.map((url) => (
        <WarmSkin key={url} url={url} />
      ))}
      <Preload all />
    </group>
  );
}
