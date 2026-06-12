import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PointLight } from 'three';
import { useGameStore } from '../store/useGameStore';

/**
 * Warm point lights for the arena's burning barrels — cheap (shadowless, bounded
 * distance) glows that pool firelight on the junk around each barrel.
 *
 * The light POOL is fixed for the match (one per barrel the layout spawned) and
 * never mounts/unmounts: changing the number of lights in a scene forces three.js
 * to recompile every material (a visible frame hitch — what made a barrel "lag
 * when it jumps"). Instead each light follows its barrel while it lives and is
 * dimmed to zero once the barrel detonates and despawns.
 */
function FireLight({ barrelId }: { barrelId: string }) {
  const ref = useRef<PointLight>(null);
  useFrame(() => {
    const light = ref.current;
    if (!light) return;
    const b = useGameStore.getState().barrels.get(barrelId);
    if (b) {
      light.position.set(b.x, b.y + 1.4, b.z);
      light.intensity = 9;
    } else {
      light.intensity = 0; // gone — keep the light mounted, just unlit
    }
  });
  return <pointLight ref={ref} color="#ff7a3a" intensity={9} distance={9} decay={2} />;
}

/** `barrelIds` is the FIXED match roster (b0…bN-1), not the live set — so the
 *  light count is constant and no material recompile is triggered on explosions. */
export function ArenaLights({ barrelIds }: { barrelIds: string[] }) {
  return (
    <>
      {barrelIds.map((id) => (
        <FireLight key={id} barrelId={id} />
      ))}
    </>
  );
}
