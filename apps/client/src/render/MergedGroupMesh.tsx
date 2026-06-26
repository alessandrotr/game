import { useThree } from '@react-three/fiber';
import type { MergedGroup } from './mergeGeometry';
import { glassMaterialFor } from './glassMaterial';
import { brickOnBeforeCompile, brickCacheKey } from './brickMaterial';
import { roofTileOnBeforeCompile, roofTileCacheKey } from './roofTileMaterial';

/** The `<*Material>` element for a merged group — shared by the plain merged mesh
 *  and the instanced renderer so they always match. `glass` is the renderer's one
 *  shared glass material (pass `null` to fall through to the standard branch). */
export function MergedGroupMaterial({
  group,
  glass,
}: {
  group: MergedGroup;
  glass: ReturnType<typeof glassMaterialFor> | null;
}) {
  const p = group.part;
  // Plain opaque parts were merged across colors into one vertex-colored mesh.
  if (group.vertexColors) {
    return (
      <meshStandardMaterial
        vertexColors
        metalness={p.metalness ?? 0.1}
        roughness={p.roughness ?? 0.7}
        flatShading
      />
    );
  }
  if (p.material === 'glass' && glass) {
    return <primitive object={glass} attach="material" />;
  }
  return (
    <meshStandardMaterial
      color={p.color}
      emissive={p.emissive ?? '#000000'}
      emissiveIntensity={p.emissiveIntensity ?? (p.emissive ? 1 : 0)}
      metalness={p.metalness ?? 0.1}
      roughness={p.roughness ?? 0.7}
      transparent={p.opacity != null}
      opacity={p.opacity ?? 1}
      onBeforeCompile={
        p.material === 'tile'
          ? roofTileOnBeforeCompile
          : p.material === 'brick'
            ? brickOnBeforeCompile
            : undefined
      }
      customProgramCacheKey={
        p.material === 'tile' ? roofTileCacheKey : p.material === 'brick' ? brickCacheKey : undefined
      }
      flatShading
    />
  );
}

/** Render one merged group with the right material (glass / brick / tile / plain). */
export function MergedGroupMesh({ group }: { group: MergedGroup }) {
  const glass = useThree((s) => glassMaterialFor(s.gl));
  return (
    <mesh geometry={group.geometry} castShadow={group.castShadow} receiveShadow={group.receiveShadow}>
      <MergedGroupMaterial group={group} glass={glass} />
    </mesh>
  );
}
