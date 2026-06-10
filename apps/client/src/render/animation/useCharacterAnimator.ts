import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { LoopOnce, LoopRepeat, type AnimationAction, type Group } from 'three';
import type { AnimationName } from '@arena/shared';

/**
 * The character animation controller (Phase 4.1.2). Two backends sit behind one
 * idea: gameplay only ever names a **logical** `AnimationName`, and the
 * controller maps it to playback — a real GLTF clip when the model has a
 * skeleton, or a procedural transform for skeleton-less placeholders. Swapping
 * the model or applying a cosmetic skin changes the descriptor, never the state
 * machine that produces the name.
 */

/** Logical animations that loop; everything else is a one-shot that clamps. */
const LOOPING: ReadonlySet<AnimationName> = new Set<AnimationName>(['idle', 'walk', 'run']);

/** Crossfade duration between clips, in seconds. */
const FADE = 0.18;

export function isLooping(name: AnimationName): boolean {
  return LOOPING.has(name);
}

/**
 * GLTF backend: watches the logical animation getter and crossfades the bound
 * `useAnimations` actions accordingly. `resolveClip` turns a logical name into a
 * clip name present in the model (with an idle fallback so a model missing a
 * clip still shows *something* rather than freezing).
 */
export function useGltfAnimator(
  actions: Record<string, AnimationAction | null>,
  getAnimation: () => AnimationName,
  resolveClip: (name: AnimationName) => string | undefined,
): void {
  const currentName = useRef<AnimationName | null>(null);

  const actionFor = (name: AnimationName): AnimationAction | null => {
    const clip = resolveClip(name) ?? resolveClip('idle');
    return clip ? (actions[clip] ?? null) : null;
  };

  useFrame(() => {
    const name = getAnimation();
    if (name === currentName.current) return;

    const prev = currentName.current ? actionFor(currentName.current) : null;
    const next = actionFor(name);
    currentName.current = name;

    if (!next) {
      prev?.fadeOut(FADE);
      return;
    }

    const loop = isLooping(name);
    next.reset();
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;

    if (prev && prev !== next) prev.fadeOut(FADE);
    next.fadeIn(FADE).play();
  });
}

/**
 * Placeholder backend: drives a lightweight procedural motion on a group of
 * primitive meshes (no skeleton). Gives placeholders readable feedback for each
 * state until a rigged GLTF is dropped in. `phase` offsets the cycle per
 * character so a crowd doesn't bob in lockstep.
 */
export function useProceduralAnimator(
  group: React.RefObject<Group | null>,
  getAnimation: () => AnimationName,
  phase: number,
): void {
  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const t = state.clock.elapsedTime;
    const name = getAnimation();

    // Reset to a neutral pose each frame; the active state writes its offsets.
    node.position.y = 0;
    node.rotation.z = 0;
    node.scale.setScalar(1);

    switch (name) {
      case 'idle':
        node.position.y = Math.sin(t * 2 + phase) * 0.04;
        break;
      case 'run':
      case 'walk':
        // Quicker, springier bob to read as locomotion.
        node.position.y = Math.abs(Math.sin(t * 9 + phase)) * 0.12;
        break;
      case 'cast':
        node.scale.setScalar(1 + Math.sin(t * 16) * 0.05);
        break;
      case 'attack':
        // A brief forward/scale pop.
        node.scale.z = 1 + Math.max(0, Math.sin(t * 18)) * 0.18;
        break;
      case 'hit':
        node.rotation.z = Math.sin(t * 40) * 0.06;
        break;
      case 'die':
        // Tip over and sink toward the ground.
        node.rotation.z = Math.PI / 2;
        node.position.y = -0.3;
        break;
    }
  });
}
