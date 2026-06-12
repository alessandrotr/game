import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ShaderMaterial } from 'three';
import type { Vec3 } from '@arena/shared';

/**
 * Shared building blocks for the ability shaders. Every effect is procedural
 * (no textures), additive-blended, and animated by advancing a single `uTime`
 * (and, for bursts, a normalized `uProgress`) uniform per frame — so a few
 * effects on screen cost almost nothing. The same noise basis is reused across
 * all shaders so they read as one coherent visual language.
 */

/** 2D value-noise + 4-octave fbm. Prepend to any fragment shader that needs it. */
export const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
`;

/** Flat pass-through vertex shader exposing `vUv`. */
export const UV_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Props every burst (one-shot) shader receives from the VFX layer. */
export interface BurstShaderProps {
  /** Lifetime in ms (from the VFX descriptor). */
  durationMs: number;
  /** Called once when the lifetime elapses, so the layer can unmount it. */
  onComplete: () => void;
  /** Cast direction (for oriented effects like cleave/dash). */
  direction?: Vec3;
}

/** Advance a material's `uTime` uniform every frame (for looping projectile shaders). */
export function useUTime(matRef: React.RefObject<ShaderMaterial | null>): void {
  useFrame((_, delta) => {
    const u = matRef.current?.uniforms?.uTime;
    if (u) u.value += delta;
  });
}

/**
 * Drives a one-shot burst: advances `uTime`, ramps `uProgress` 0→1 over
 * `durationMs`, and fires `onComplete` exactly once when it finishes. A random
 * `seed` is baked into `uTime` so simultaneous casts don't animate in lockstep.
 */
export function useBurstClock(durationMs: number, onComplete: () => void) {
  const matRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const seed = useMemo(() => Math.random() * 10, []);

  useFrame((_, delta) => {
    elapsed.current += delta * 1000;
    const u = matRef.current?.uniforms;
    if (u) {
      if (u.uTime) u.uTime.value += delta;
      if (u.uProgress) u.uProgress.value = Math.min(1, elapsed.current / durationMs);
    }
    if (!done.current && elapsed.current >= durationMs) {
      done.current = true;
      onComplete();
    }
  });

  return { matRef, seed };
}

/** Yaw (radians) for a cast direction, for orienting ground/streak effects. */
export function yawFromDirection(direction?: Vec3): number {
  if (!direction) return 0;
  const [dx, , dz] = direction;
  return Math.atan2(dx, dz);
}
