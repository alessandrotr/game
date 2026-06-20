import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CanvasTexture } from 'three';
import type { GltfModel, PlaceholderModel, RenderSource } from '@arena/shared';
import type { PaintTextures } from '../paint/paintSurface';
import { PrimitiveGeometry } from './geometry';
import { glassMaterialFor } from './glassMaterial';
import { brickOnBeforeCompile, brickCacheKey } from './brickMaterial';
import { roofTileOnBeforeCompile, roofTileCacheKey } from './roofTileMaterial';
import { enchantMaterialFor, type EnchantParams } from './enchantMaterial';
import { AssetErrorBoundary } from './AssetErrorBoundary';

/** The paint texture for a given part name, or null when it has none / unpainted. */
function partMap(paint: PaintTextures | undefined, name?: string) {
  if (!paint || !name) return null;
  return (paint as Record<string, CanvasTexture | null | undefined>)[name] ?? null;
}

/**
 * The single rendering seam for every asset. Given a `RenderSource` it draws
 * either primitive placeholder parts or a GLTF model. This is the one place that
 * changes when art is swapped in — descriptors flip `kind: 'placeholder'` to
 * `kind: 'gltf'` and nothing else in the app needs to know.
 *
 * `paint` is an optional per-part paint texture map (keyed by part name, e.g.
 * `body`/`head`), applied as that part's color map so a player's custom paint job
 * shows on their character. Ignored by non-character assets (no matching parts).
 */
export function AssetMesh({
  source,
  paint,
  enchant,
}: {
  source: RenderSource;
  paint?: PaintTextures;
  /** When set, a weapon's `enchantable` parts render with this animated enchant. */
  enchant?: EnchantParams;
}) {
  if (source.kind === 'gltf') {
    return (
      <AssetErrorBoundary label={source.url}>
        <Suspense fallback={null}>
          <GltfMesh model={source} />
        </Suspense>
      </AssetErrorBoundary>
    );
  }
  return <PlaceholderMesh model={source} paint={paint} enchant={enchant} />;
}

function PlaceholderMesh({
  model,
  paint,
  enchant,
}: {
  model: PlaceholderModel;
  paint?: PaintTextures;
  enchant?: EnchantParams;
}) {
  // One shared glass material per renderer — see glassMaterialFor. The hook runs
  // unconditionally even when a model has no glass parts; that's just a WeakMap
  // lookup, so it's free.
  const glass = useThree((s) => glassMaterialFor(s.gl));
  return (
    <group>
      {model.parts.map((part, i) =>
        enchant && part.enchantable ? (
          <mesh
            key={part.name ?? i}
            name={part.name ?? ''}
            position={part.position ?? [0, 0, 0]}
            rotation={part.rotation ?? [0, 0, 0]}
            scale={part.scale ?? 1}
            castShadow={part.castShadow ?? true}
            receiveShadow={false}
            material={enchantMaterialFor(enchant.effect, enchant.color, enchant.color2)}
          >
            <PrimitiveGeometry shape={part.shape} args={part.args} />
          </mesh>
        ) : part.material === 'glass' ? (
          <mesh
            key={part.name ?? i}
            name={part.name ?? ''}
            position={part.position ?? [0, 0, 0]}
            rotation={part.rotation ?? [0, 0, 0]}
            scale={part.scale ?? 1}
            castShadow={part.castShadow ?? false}
            receiveShadow={false}
            material={glass}
          >
            <PrimitiveGeometry shape={part.shape} args={part.args} />
          </mesh>
        ) : (
          <mesh
            key={part.name ?? i}
            name={part.name ?? ''}
            position={part.position ?? [0, 0, 0]}
            rotation={part.rotation ?? [0, 0, 0]}
            scale={part.scale ?? 1}
            castShadow={part.castShadow ?? true}
            receiveShadow={part.receiveShadow ?? true}
          >
            <PrimitiveGeometry shape={part.shape} args={part.args} />
            <meshStandardMaterial
              // Remount the material when the map's PRESENCE toggles: adding a map
              // to an already-compiled material changes its shader defines, which
              // won't take effect without a recompile — keying forces a fresh one.
              key={partMap(paint, part.name) ? 'mapped' : 'plain'}
              // A paint texture supplied for this part becomes its color map; the
              // base color then goes white so painted hues read true (a map
              // multiplies with `color`). Unpainted parts keep their flat color.
              map={partMap(paint, part.name)}
              color={partMap(paint, part.name) ? '#ffffff' : part.color}
              emissive={part.emissive ?? '#000000'}
              emissiveIntensity={part.emissiveIntensity ?? (part.emissive ? 1 : 0)}
              metalness={part.metalness ?? 0.1}
              roughness={part.roughness ?? 0.7}
              transparent={part.opacity != null}
              opacity={part.opacity ?? 1}
              // `brick`/`tile` overlay a procedural masonry / roof-tile pattern on
              // the lit material; the shared cache key compiles each one once.
              onBeforeCompile={
                part.material === 'tile'
                  ? roofTileOnBeforeCompile
                  : part.material === 'brick'
                    ? brickOnBeforeCompile
                    : undefined
              }
              customProgramCacheKey={
                part.material === 'tile'
                  ? roofTileCacheKey
                  : part.material === 'brick'
                    ? brickCacheKey
                    : undefined
              }
              // Faceted shading for a crisp, stylized low-poly read (hard light per
              // face on roofs/barrels/etc.). Free: flat normals are derived in the
              // shader, no geometry/texture cost.
              flatShading
            />
          </mesh>
        ),
      )}
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
