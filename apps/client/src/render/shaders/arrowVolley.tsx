import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { BurstShaderProps } from './common';
import { WoodArrow } from '../WoodArrow';

/**
 * Archer concussive volley: a handful of arrows rain down onto the target area,
 * staggered, each falling from high up and sticking in the ground before fading.
 * A faint ground ring marks the struck circle. Tinted to the equipped enchant.
 *
 * Plain animated meshes (no shader) — cheap: a few small bolts for ~1s.
 */

const ARROWS = 6;
const RADIUS = 3.2; // spread (crippling AoE ~4); EffectAnchor scales for aoe bonuses
const FALL_FROM = 5; // start height (low enough to stay on-screen the whole fall)
const FALL_MS = 460; // per-arrow fall time
const STICK_MS = 420; // linger after landing before fading

export function ArrowVolleyEffect({ durationMs, onComplete, tint }: BurstShaderProps) {
  const color = tint ?? '#dfe7f0';
  const arrows = useMemo(
    () =>
      Array.from({ length: ARROWS }, (_, i) => {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * RADIUS;
        return {
          x: Math.cos(ang) * r,
          z: Math.sin(ang) * r,
          delay: i * 70 + Math.random() * 60, // staggered ms
          // Fall straight down (vertical, no lean).
          tiltX: 0,
          tiltZ: 0,
        };
      }),
    [],
  );
  const refs = useRef<(Group | null)[]>([]);
  const ringRef = useRef<Mesh>(null);
  const elapsed = useRef(0);
  const done = useRef(false);

  useFrame((_, delta) => {
    elapsed.current += delta * 1000;
    const ms = elapsed.current;

    arrows.forEach((a, i) => {
      const g = refs.current[i];
      if (!g) return;
      const local = (ms - a.delay) / FALL_MS;
      if (local <= 0) {
        g.visible = false;
        return;
      }
      g.visible = true;
      if (local < 1) {
        const f = local * local; // accelerate as it falls
        g.position.set(a.x, FALL_FROM * (1 - f), a.z);
      } else {
        // Planted in the ground at full size for a brief stick, then gone.
        const after = (ms - a.delay - FALL_MS) / STICK_MS;
        g.position.set(a.x, 0, a.z);
        if (after >= 1) g.visible = false;
      }
    });

    const ring = ringRef.current;
    if (ring) {
      const t = ms / durationMs;
      const op = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      (ring.material as MeshBasicMaterial).opacity = Math.max(0, op) * 0.5;
    }

    if (!done.current && ms >= durationMs) {
      done.current = true;
      onComplete();
    }
  });

  return (
    <group>
      {/* Target-area ring on the ground. */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[RADIUS * 0.92, RADIUS, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      {arrows.map((a, i) => (
        <group
          key={i}
          ref={(el) => (refs.current[i] = el)}
          visible={false}
          rotation={[a.tiltX, 0, a.tiltZ]}
        >
          {/* real wood arrow, pointing down; tip embeds slightly so it plants in
              the ground (shaft sticking up) rather than sitting on the surface */}
          <group position={[0, 1.55, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.4, 1.4, 2.4]}>
            <WoodArrow />
          </group>
        </group>
      ))}
    </group>
  );
}
