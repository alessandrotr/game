import { Suspense, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DoubleSide, AdditiveBlending, type ShaderMaterial, type CanvasTexture, type Matrix4 } from 'three';
import type { GltfModel, PlaceholderModel, PlaceholderPart, RenderSource } from '@arena/shared';
import { UV_VERTEX, useUTime } from './shaders/common';
import { barrelFireFrag } from './shaders/coverEffects';
import type { PaintTextures } from '../paint/paintSurface';
import { PrimitiveGeometry } from './geometry';
import { glassMaterialFor } from './glassMaterial';
import { brickOnBeforeCompile, brickCacheKey } from './brickMaterial';
import { roofTileOnBeforeCompile, roofTileCacheKey } from './roofTileMaterial';
import { enchantMaterialFor, type EnchantParams } from './enchantMaterial';
import { AssetErrorBoundary } from './AssetErrorBoundary';
import { mergePlaced, trsMatrix, type MergedGroup } from './mergeGeometry';
import { MergedGroupMesh } from './MergedGroupMesh';

/** The paint texture for a given part name, or null when it has none / unpainted. */
function partMap(paint: PaintTextures | undefined, name?: string) {
  if (!paint || !name) return null;
  return (paint as Record<string, CanvasTexture | null | undefined>)[name] ?? null;
}

/**
 * Per-model merged geometry for a placeholder prop, cached so every instance of
 * the same model (e.g. every oil drum) shares one set of batched meshes. A prop's
 * parts never move relative to each other, so baking them into a few
 * material-grouped meshes turns a ~30-part house from ~30 draw calls into a
 * handful, with no visible change. Animated `fire` parts can't be baked (they each
 * need their own live shader), so they're kept out and drawn individually.
 */
interface MergedProp {
  groups: MergedGroup[];
  fireParts: PlaceholderPart[];
}
const mergedPropCache = new WeakMap<PlaceholderModel, MergedProp>();

function getMergedProp(model: PlaceholderModel): MergedProp {
  const cached = mergedPropCache.get(model);
  if (cached) return cached;
  const fireParts: PlaceholderPart[] = [];
  const placed: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  for (const part of model.parts) {
    if (part.material === 'fire') {
      fireParts.push(part);
      continue;
    }
    placed.push({ part, matrix: trsMatrix(part.position, part.rotation, part.scale) });
  }
  const result: MergedProp = { groups: mergePlaced(placed), fireParts };
  mergedPropCache.set(model, result);
  return result;
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
  merge = false,
}: {
  source: RenderSource;
  paint?: PaintTextures;
  /** When set, a weapon's `enchantable` parts render with this animated enchant. */
  enchant?: EnchantParams;
  /** Batch this placeholder's parts into a few merged meshes (static props only —
   *  not painted/enchanted/animated assets). Big draw-call win for dense prop fields. */
  merge?: boolean;
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
  return <PlaceholderMesh model={source} paint={paint} enchant={enchant} merge={merge} />;
}

function PlaceholderMesh({
  model,
  paint,
  enchant,
  merge = false,
}: {
  model: PlaceholderModel;
  paint?: PaintTextures;
  enchant?: EnchantParams;
  merge?: boolean;
}) {
  // One shared glass material per renderer — see glassMaterialFor. The hook runs
  // unconditionally even when a model has no glass parts; that's just a WeakMap
  // lookup, so it's free.
  const glass = useThree((s) => glassMaterialFor(s.gl));

  // Static prop fast path: parts baked into a few material-batched meshes (shared
  // across every instance of this model). Skipped for painted/enchanted assets,
  // whose per-part textures/materials can't be merged.
  if (merge && !paint && !enchant) {
    const { groups, fireParts } = getMergedProp(model);
    return (
      <group>
        {groups.map((g) => (
          <MergedGroupMesh key={g.key} group={g} />
        ))}
        {fireParts.map((part, i) => (
          <FireMeshPart key={`fire-${i}`} part={part} />
        ))}
      </group>
    );
  }

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
        ) : part.material === 'fire' ? (
          <FireMeshPart
            key={part.name ?? i}
            part={part}
          />
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

function FireMeshPart({ part }: { part: PlaceholderPart }) {
  const matRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: Math.random() * 10 } }), []);
  useUTime(matRef);
  return (
    <mesh
      position={part.position ?? [0, 0, 0]}
      rotation={part.rotation ?? [0, 0, 0]}
      scale={part.scale ?? 1}
      castShadow={false}
      receiveShadow={false}
    >
      <PrimitiveGeometry shape={part.shape} args={part.args} />
      <shaderMaterial
        ref={matRef}
        vertexShader={UV_VERTEX}
        fragmentShader={barrelFireFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
