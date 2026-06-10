import { Suspense, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Group } from 'three';
import type {
  AnimationName,
  CharacterDescriptor,
  GltfModel,
  WeaponDescriptor,
} from '@arena/shared';
import { assets } from '../assets/registry';
import { AssetMesh } from './AssetMesh';
import { useGltfAnimator, useProceduralAnimator } from './animation/useCharacterAnimator';

/** Sum of char codes — a stable per-character phase offset for procedural motion. */
function seedOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

/** Default animation source for static contexts (previews, NPCs) that don't
 *  drive a state machine. */
const ALWAYS_IDLE = (): AnimationName => 'idle';

interface CharacterModelProps {
  descriptor: CharacterDescriptor;
  /**
   * Source of the current logical animation, polled each frame. Independent of
   * the asset: the same getter drives a procedural placeholder or a rigged GLTF.
   * Defaults to a constant idle so the component is usable without a state machine.
   */
  getAnimation?: () => AnimationName;
}

/**
 * Assembles a character's body (placeholder primitives or a rigged GLTF) plus
 * its grip weapon, and animates it via the controller. The transform, network
 * smoothing, and labels are the caller's responsibility (see `PlayerEntity`).
 */
export function CharacterModel({ descriptor, getAnimation = ALWAYS_IDLE }: CharacterModelProps) {
  const phase = useMemo(() => seedOf(descriptor.id), [descriptor.id]);
  const weapon = descriptor.weaponId ? assets.getWeapon(descriptor.weaponId) : undefined;

  if (descriptor.render.kind === 'gltf') {
    return (
      <group>
        <Suspense fallback={null}>
          <GltfCharacter model={descriptor.render} getAnimation={getAnimation} phase={phase} />
        </Suspense>
        {weapon && <WeaponMount weapon={weapon} />}
      </group>
    );
  }

  return (
    <PlaceholderCharacter descriptor={descriptor} getAnimation={getAnimation} phase={phase}>
      {weapon && <WeaponMount weapon={weapon} />}
    </PlaceholderCharacter>
  );
}

/** A weapon mounted in the character's grip transform. */
function WeaponMount({ weapon }: { weapon: WeaponDescriptor }) {
  return (
    <group
      position={weapon.grip?.position ?? [0, 0, 0]}
      rotation={weapon.grip?.rotation ?? [0, 0, 0]}
      scale={weapon.grip?.scale ?? 1}
    >
      <AssetMesh source={weapon.render} />
    </group>
  );
}

/** Placeholder body: primitives driven by the procedural animator backend. */
function PlaceholderCharacter({
  descriptor,
  getAnimation,
  phase,
  children,
}: {
  descriptor: CharacterDescriptor;
  getAnimation: () => AnimationName;
  phase: number;
  children?: React.ReactNode;
}) {
  const group = useRef<Group>(null);
  useProceduralAnimator(group, getAnimation, phase);
  return (
    <group ref={group}>
      <AssetMesh source={descriptor.render} />
      {children}
    </group>
  );
}

/** GLTF body: a cloned instance driven by its embedded clips when present, or a
 *  procedural fallback (idle bob / cast pulse / death) when the model has none. */
function GltfCharacter({
  model,
  getAnimation,
  phase,
}: {
  model: GltfModel;
  getAnimation: () => AnimationName;
  phase: number;
}) {
  const { scene, animations } = useGLTF(model.url);
  const instance = useMemo(() => cloneSkinned(scene), [scene]);
  const root = useRef<Group>(null);
  const { actions } = useAnimations(animations, root);
  const hasClips = animations.length > 0;

  const resolveClip = useMemo(() => {
    const clips = model.clips ?? {};
    return (name: AnimationName) => clips[name];
  }, [model.clips]);

  // Rigged models play real clips; clipless models get procedural motion on the
  // root (its transform composes with the primitive's placement offsets below).
  useGltfAnimator(actions, getAnimation, resolveClip);
  useProceduralAnimator(root, getAnimation, phase, !hasClips);

  return (
    <group ref={root}>
      <primitive
        object={instance}
        scale={model.scale ?? 1}
        position={model.offset ?? [0, 0, 0]}
        rotation={[0, model.yaw ?? 0, 0]}
      />
    </group>
  );
}
