import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GltfModel, PlaceholderModel, RenderSource } from '@arena/shared';
import { PrimitiveGeometry } from './geometry';

/**
 * The single rendering seam for every asset. Given a `RenderSource` it draws
 * either primitive placeholder parts or a GLTF model. This is the one place that
 * changes when art is swapped in — descriptors flip `kind: 'placeholder'` to
 * `kind: 'gltf'` and nothing else in the app needs to know.
 */
export function AssetMesh({ source }: { source: RenderSource }) {
  if (source.kind === 'gltf') {
    return (
      <Suspense fallback={null}>
        <GltfMesh model={source} />
      </Suspense>
    );
  }
  return <PlaceholderMesh model={source} />;
}

function PlaceholderMesh({ model }: { model: PlaceholderModel }) {
  return (
    <group>
      {model.parts.map((part, i) => (
        <mesh
          key={part.name ?? i}
          position={part.position ?? [0, 0, 0]}
          rotation={part.rotation ?? [0, 0, 0]}
          scale={part.scale ?? 1}
          castShadow={part.castShadow ?? true}
          receiveShadow={part.receiveShadow ?? true}
        >
          <PrimitiveGeometry shape={part.shape} args={part.args} />
          <meshStandardMaterial
            color={part.color}
            emissive={part.emissive ?? '#000000'}
            emissiveIntensity={part.emissiveIntensity ?? (part.emissive ? 1 : 0)}
            metalness={part.metalness ?? 0.1}
            roughness={part.roughness ?? 0.7}
            transparent={part.opacity != null}
            opacity={part.opacity ?? 1}
          />
        </mesh>
      ))}
    </group>
  );
}

function GltfMesh({ model }: { model: GltfModel }) {
  const { scene } = useGLTF(model.url);
  // `useGLTF` caches and shares one scene per url; rendering it directly would
  // move the *same* Object3D between instances. Clone (skeleton-aware) so each
  // mounted asset gets its own meshes — required once N players share a model.
  const instance = useMemo(() => cloneSkinned(scene), [scene]);
  return <primitive object={instance} scale={model.scale ?? 1} />;
}
