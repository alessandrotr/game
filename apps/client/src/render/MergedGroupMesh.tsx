import { useThree } from '@react-three/fiber';
import type { MergedGroup } from './mergeGeometry';
import { glassMaterialFor } from './glassMaterial';
import { brickOnBeforeCompile, brickCacheKey } from './brickMaterial';
import { roofTileOnBeforeCompile, roofTileCacheKey } from './roofTileMaterial';

/** Render one merged group with the right material (glass / brick / tile / plain). */
export function MergedGroupMesh({ group }: { group: MergedGroup }) {
  const glass = useThree((s) => glassMaterialFor(s.gl));
  const p = group.part;
  if (p.material === 'glass') {
    return (
      <mesh
        geometry={group.geometry}
        material={glass}
        castShadow={group.castShadow}
        receiveShadow={group.receiveShadow}
      />
    );
  }
  // Plain opaque parts were merged across colors into one vertex-colored mesh.
  if (group.vertexColors) {
    return (
      <mesh
        geometry={group.geometry}
        castShadow={group.castShadow}
        receiveShadow={group.receiveShadow}
      >
        <meshStandardMaterial
          vertexColors
          metalness={p.metalness ?? 0.1}
          roughness={p.roughness ?? 0.7}
          flatShading
        />
      </mesh>
    );
  }

  return (
    <mesh geometry={group.geometry} castShadow={group.castShadow} receiveShadow={group.receiveShadow}>
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
    </mesh>
  );
}
