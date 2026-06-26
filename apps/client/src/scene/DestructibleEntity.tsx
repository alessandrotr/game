import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { Quaternion, Vector3 } from 'three';
import type { Group, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';

/**
 * A destructible environment object rendered from replicated state — either a
 * boulder (from a rock pile — the old "tire" kind) or a barrel (the arena's
 * drum piles + loose ones).
 * The server owns the lightweight rigid-body sim and streams the transform
 * (position + orientation quaternion); here we render the right low-poly mesh
 * and smooth the 20 Hz transform toward the latest snapshot each frame (position
 * lerp + orientation slerp) so motion reads cleanly without per-tick re-renders.
 *
 * Drums also carry HP: a floating integrity bar (billboarded above the drum,
 * tracking only its position so it doesn't tumble with the rolling body) shows
 * once a drum is damaged, and is hidden at full HP.
 */

/** Mossy grey fieldstone — the destructible "tire" piles are boulders here. */
const TIRE_COLOR = '#888a82';
/** Smoothing rate for the transform lerp/slerp (higher = snappier). */
const SMOOTH_RATE = 18;
/** Amber "integrity", matching the cover-structure bar. */
const BAR_FILL = '#f4a64a';

export function DestructibleEntity({ destructibleId }: { destructibleId: string }) {
  const group = useRef<Group>(null);
  const bar = useRef<Group>(null);
  const barFill = useRef<Mesh>(null);
  const initial = useGameStore.getState().destructibles.get(destructibleId);
  // Scratch objects reused each frame (no per-frame allocation).
  const targetPos = useRef(new Vector3());
  const targetQuat = useRef(new Quaternion());

  const hasHp = !!initial && initial.maxHp > 0;
  // Bar floats just above the top (body center + half-height + clearance).
  const barY = initial ? initial.sy + 0.7 : 1;
  const barWidth = initial ? Math.max(0.8, initial.sx * 2.6) : 1;

  useFrame((_, delta) => {
    const d = useGameStore.getState().destructibles.get(destructibleId);
    if (!d || !group.current) return;
    targetPos.current.set(d.x, d.y, d.z);
    targetQuat.current.set(d.qx, d.qy, d.qz, d.qw);
    const t = 1 - Math.exp(-SMOOTH_RATE * delta);
    group.current.position.lerp(targetPos.current, t);
    group.current.quaternion.slerp(targetQuat.current, t);

    // Integrity bar: follow the drum's (un-rotated) position; show only damaged.
    if (bar.current) {
      bar.current.position.set(group.current.position.x, group.current.position.y + barY, group.current.position.z);
      const damaged = hasHp && d.maxHp > 0 && d.hp > 0 && d.hp < d.maxHp;
      bar.current.visible = damaged;
      if (damaged && barFill.current) {
        const ratio = Math.min(1, Math.max(0, d.hp / d.maxHp));
        barFill.current.scale.x = Math.max(0.001, ratio);
        barFill.current.position.x = -(barWidth * (1 - ratio)) / 2;
      }
    }
  });

  if (!initial) return null;
  const isTire = initial.kind === 'tire';
  return (
    <>
      <group
        ref={group}
        position={[initial.x, initial.y, initial.z]}
        quaternion={[initial.qx, initial.qy, initial.qz, initial.qw]}
      >
        {isTire && (
          // A boulder: a faceted low-poly stone, scaled a touch irregular. The body
          // quaternion (applied to the group) tumbles it as it's knocked around —
          // same destructible/roll behaviour the tire had.
          <mesh castShadow receiveShadow scale={[1.15, 0.85, 1.05]}>
            <icosahedronGeometry args={[initial.sx, 0]} />
            <meshStandardMaterial color={TIRE_COLOR} roughness={1} metalness={0} flatShading />
          </mesh>
        )}
        {/* Oil-drum bodies are drawn in one batch by <InstancedDrums>; this group
            still smooths position so the integrity bar above tracks the drum. */}
      </group>
      {hasHp && (
        // Floating integrity bar — billboarded, position-tracked in useFrame so it
        // stays upright above the body instead of tumbling with it.
        <group ref={bar} visible={false}>
          <Billboard>
            <mesh>
              <planeGeometry args={[barWidth, 0.12]} />
              <meshBasicMaterial color="#1a1f2e" />
            </mesh>
            <mesh ref={barFill} position={[0, 0, 0.001]}>
              <planeGeometry args={[barWidth, 0.09]} />
              <meshBasicMaterial color={BAR_FILL} />
            </mesh>
          </Billboard>
        </group>
      )}
    </>
  );
}
