import { Suspense, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DoubleSide,
  AdditiveBlending,
  ShaderMaterial,
  type CanvasTexture,
  SphereGeometry,
  CapsuleGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  TorusGeometry,
  Euler,
  Matrix4,
  Float32BufferAttribute,
  Color,
  type BufferGeometry,
} from 'three';
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

interface MergedGeometries {
  standard?: BufferGeometry;
  emissive?: BufferGeometry;
  glass?: BufferGeometry;
  tile?: BufferGeometry;
  brick?: BufferGeometry;
  fireParts: PlaceholderPart[];
}

const mergedGeometryCache = new WeakMap<PlaceholderModel, MergedGeometries>();

function createPartGeometry(part: PlaceholderPart): BufferGeometry {
  let geom: BufferGeometry;
  const args = part.args;
  switch (part.shape) {
    case 'box':
      geom = new BoxGeometry(args[0], args[1], args[2]);
      break;
    case 'sphere':
      geom = new SphereGeometry(args[0], args[1] ?? 8, args[2] ?? 8);
      break;
    case 'capsule':
      geom = new CapsuleGeometry(args[0], args[1], args[2] ?? 4, args[3] ?? 8);
      break;
    case 'cone':
      geom = new ConeGeometry(args[0], args[1], args[2] ?? 8);
      break;
    case 'cylinder':
      geom = new CylinderGeometry(args[0], args[1], args[2], args[3] ?? 8);
      break;
    case 'torus':
      geom = new TorusGeometry(args[0], args[1], args[2] ?? 8, args[3] ?? 8, args[4]);
      break;
    default:
      geom = new BoxGeometry(1, 1, 1);
  }

  if (part.scale != null) {
    if (Array.isArray(part.scale)) {
      geom.scale(part.scale[0], part.scale[1], part.scale[2]);
    } else {
      geom.scale(part.scale, part.scale, part.scale);
    }
  }
  if (part.rotation) {
    const euler = new Euler(part.rotation[0], part.rotation[1], part.rotation[2]);
    const matrix = new Matrix4().makeRotationFromEuler(euler);
    geom.applyMatrix4(matrix);
  }
  if (part.position) {
    geom.translate(part.position[0], part.position[1], part.position[2]);
  }

  return geom;
}

function getOrCreateMergedGeometries(model: PlaceholderModel): MergedGeometries {
  let cached = mergedGeometryCache.get(model);
  if (cached) return cached;

  const standardGeoms: BufferGeometry[] = [];
  const emissiveGeoms: BufferGeometry[] = [];
  const glassGeoms: BufferGeometry[] = [];
  const tileGeoms: BufferGeometry[] = [];
  const brickGeoms: BufferGeometry[] = [];
  const fireParts: PlaceholderPart[] = [];

  for (const part of model.parts) {
    if (part.material === 'fire') {
      fireParts.push(part);
      continue;
    }

    const geom = createPartGeometry(part);

    if (part.material !== 'glass' && part.material !== 'tile' && part.material !== 'brick') {
      const colorObj = new Color(part.color || '#ffffff');
      const colors: number[] = [];
      const posAttr = geom.getAttribute('position');
      if (posAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          colors.push(colorObj.r, colorObj.g, colorObj.b);
        }
      }
      geom.setAttribute('color', new Float32BufferAttribute(colors, 3));

      if (part.emissive && part.emissive !== '#000000') {
        emissiveGeoms.push(geom);
      } else {
        standardGeoms.push(geom);
      }
    } else if (part.material === 'glass') {
      glassGeoms.push(geom);
    } else if (part.material === 'tile') {
      tileGeoms.push(geom);
    } else if (part.material === 'brick') {
      brickGeoms.push(geom);
    }
  }

  const result: MergedGeometries = { fireParts };

  const mergeGroup = (geoms: BufferGeometry[]) => {
    if (geoms.length === 0) return undefined;
    const merged = BufferGeometryUtils.mergeGeometries(geoms);
    geoms.forEach((g) => g.dispose());
    return merged;
  };

  result.standard = mergeGroup(standardGeoms);
  result.emissive = mergeGroup(emissiveGeoms);
  result.glass = mergeGroup(glassGeoms);
  result.tile = mergeGroup(tileGeoms);
  result.brick = mergeGroup(brickGeoms);

  mergedGeometryCache.set(model, result);
  return result;
}

// Shared global geometries for zombie placeholder body parts to avoid runtime allocation/diffing
const ZOMBIE_GEOMETRIES = {
  head: new SphereGeometry(0.27, 18, 18),
  eye: new SphereGeometry(0.045, 8, 8),
  arm: new CapsuleGeometry(0.09, 0.42, 6, 10),
  torso: {
    standard: new CapsuleGeometry(0.36, 0.62, 8, 16),
    sprinter: new CapsuleGeometry(0.288, 0.62, 8, 16),
    fat: new CapsuleGeometry(0.558, 0.62, 8, 16),
    miniboss: new CapsuleGeometry(0.432, 0.62, 8, 16),
    'miniboss-raged': new CapsuleGeometry(0.432, 0.62, 8, 16),
  }
};

// Shared global materials for zombie placeholder body parts to avoid shader recompiles
const ZOMBIE_MATERIALS = {
  standard: {
    body: new MeshStandardMaterial({ color: '#6b7a52', roughness: 0.85, metalness: 0.1, flatShading: true }),
    head: new MeshStandardMaterial({ color: '#7c8a5e', roughness: 0.8, metalness: 0.1, flatShading: true }),
    eye: new MeshBasicMaterial({ color: '#d8e84a' }),
  },
  sprinter: {
    body: new MeshStandardMaterial({ color: '#7a7360', roughness: 0.85, metalness: 0.1, flatShading: true }),
    head: new MeshStandardMaterial({ color: '#8a8163', roughness: 0.8, metalness: 0.1, flatShading: true }),
    eye: new MeshBasicMaterial({ color: '#ff0d05' }),
  },
  fat: {
    body: new MeshStandardMaterial({ color: '#5d6e42', roughness: 0.85, metalness: 0.1, flatShading: true }),
    head: new MeshStandardMaterial({ color: '#6e7d4f', roughness: 0.8, metalness: 0.1, flatShading: true }),
    eye: new MeshBasicMaterial({ color: '#c9d18a' }),
  },
  miniboss: {
    body: new MeshStandardMaterial({ color: '#46512f', roughness: 0.85, metalness: 0.1, flatShading: true }),
    head: new MeshStandardMaterial({ color: '#55603a', roughness: 0.8, metalness: 0.1, flatShading: true }),
    eye: new MeshBasicMaterial({ color: '#ff3326' }),
  },
  'miniboss-raged': {
    body: new MeshStandardMaterial({ color: '#8a2c20', roughness: 0.85, metalness: 0.1, flatShading: true }),
    head: new MeshStandardMaterial({ color: '#a33729', roughness: 0.8, metalness: 0.1, flatShading: true }),
    eye: new MeshBasicMaterial({ color: '#ff2a14' }),
  }
};

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
  lightweight = false,
}: {
  source: RenderSource;
  paint?: PaintTextures;
  /** When set, a weapon's `enchantable` parts render with this animated enchant. */
  enchant?: EnchantParams;
  lightweight?: boolean;
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
  return <PlaceholderMesh model={source} paint={paint} enchant={enchant} lightweight={lightweight} />;
}

function PlaceholderMesh({
  model,
  paint,
  enchant,
  lightweight = false,
}: {
  model: PlaceholderModel;
  paint?: PaintTextures;
  enchant?: EnchantParams;
  lightweight?: boolean;
}) {
  // One shared glass material per renderer — see glassMaterialFor. The hook runs
  // unconditionally even when a model has no glass parts; that's just a WeakMap
  // lookup, so it's free.
  const glass = useThree((s) => glassMaterialFor(s.gl));

  if (!paint && !lightweight && !enchant) {
    const merged = getOrCreateMergedGeometries(model);
    return (
      <group>
        {merged.standard && (
          <mesh geometry={merged.standard} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.7} metalness={0.1} flatShading />
          </mesh>
        )}
        {merged.emissive && (
          <mesh geometry={merged.emissive} castShadow receiveShadow>
            <meshStandardMaterial
              vertexColors
              roughness={0.7}
              metalness={0.1}
              emissive="#ff5500"
              emissiveIntensity={2.5}
              flatShading
            />
          </mesh>
        )}
        {merged.glass && (
          <mesh geometry={merged.glass} castShadow={false} receiveShadow={false} material={glass} />
        )}
        {merged.tile && (
          <mesh geometry={merged.tile} castShadow receiveShadow>
            <meshStandardMaterial
              vertexColors
              roughness={0.7}
              metalness={0.1}
              flatShading
              onBeforeCompile={roofTileOnBeforeCompile}
              customProgramCacheKey={roofTileCacheKey}
            />
          </mesh>
        )}
        {merged.brick && (
          <mesh geometry={merged.brick} castShadow receiveShadow>
            <meshStandardMaterial
              vertexColors
              roughness={0.7}
              metalness={0.1}
              flatShading
              onBeforeCompile={brickOnBeforeCompile}
              customProgramCacheKey={brickCacheKey}
            />
          </mesh>
        )}
        {merged.fireParts.map((part, i) => (
          <FireMeshPart key={i} part={part} />
        ))}
      </group>
    );
  }

  // Find body part to check its color
  const bodyPart = model.parts.find((p) => p.name === 'body');
  const bodyColor = bodyPart?.color ?? '';
  let variant: 'standard' | 'sprinter' | 'fat' | 'miniboss' | 'miniboss-raged' | null = null;
  if (lightweight) {
    if (bodyColor === '#6b7a52') variant = 'standard';
    else if (bodyColor === '#7a7360') variant = 'sprinter';
    else if (bodyColor === '#5d6e42') variant = 'fat';
    else if (bodyColor === '#46512f') variant = 'miniboss';
    else if (bodyColor === '#8a2c20') variant = 'miniboss-raged';
  }

  if (variant) {
    return (
      <group>
        {model.parts.map((part, i) => {
          let geom = null;
          let mat = null;

          if (part.name === 'body') {
            geom = ZOMBIE_GEOMETRIES.torso[variant!];
            mat = ZOMBIE_MATERIALS[variant!].body;
          } else if (part.name === 'head') {
            geom = ZOMBIE_GEOMETRIES.head;
            mat = ZOMBIE_MATERIALS[variant!].head;
          } else if (part.name === 'arm.l' || part.name === 'arm.r') {
            geom = ZOMBIE_GEOMETRIES.arm;
            mat = ZOMBIE_MATERIALS[variant!].body;
          } else if (part.name === 'eye.l' || part.name === 'eye.r') {
            geom = ZOMBIE_GEOMETRIES.eye;
            mat = ZOMBIE_MATERIALS[variant!].eye;
          }

          if (geom && mat) {
            return (
              <mesh
                key={part.name ?? i}
                name={part.name ?? ''}
                position={part.position ?? [0, 0, 0]}
                rotation={part.rotation ?? [0, 0, 0]}
                scale={part.scale ?? 1}
                castShadow={false}
                receiveShadow={false}
                geometry={geom}
                material={mat}
              />
            );
          }

          return (
            <mesh
              key={part.name ?? i}
              name={part.name ?? ''}
              position={part.position ?? [0, 0, 0]}
              rotation={part.rotation ?? [0, 0, 0]}
              scale={part.scale ?? 1}
              castShadow={false}
              receiveShadow={false}
            >
              <PrimitiveGeometry shape={part.shape} args={part.args} />
              <meshStandardMaterial
                color={part.color}
                roughness={part.roughness ?? 0.7}
                metalness={part.metalness ?? 0.1}
                flatShading
              />
            </mesh>
          );
        })}
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
