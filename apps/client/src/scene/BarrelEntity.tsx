import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';
import type { Group } from 'three';
import { useGameStore } from '../store/useGameStore';
import { useTargetStore } from '../store/targetState';
import { clearDestination } from '../store/destinationState';
import { sendAttack } from '../network/colyseus';
import { AssetInstance } from '../render/AssetInstance';

/** The drum body's half-height — the visual is shifted down by this so the group
 *  origin is the drum's CENTER (the physics pivot), matching the server body. */
const HALF_HEIGHT = 0.5;
/** Smoothing rate for the transform lerp/slerp (higher = snappier). */
const SMOOTH_RATE = 18;

/**
 * A live, interactive burning barrel rendered from replicated state. The visual
 * is the fire-drum prop; an invisible collider makes it left-clickable so the
 * player can auto-attack it (the server then LAUNCHES it on a real physics arc
 * and detonates it). Position + rotation come from the server's Rapier body and
 * are smoothed toward the latest snapshot each frame (lerp + slerp), so the
 * tumbling toss reads cleanly instead of stepping at the 20 Hz tick rate.
 */
export function BarrelEntity({ barrelId }: { barrelId: string }) {
  const group = useRef<Group>(null);
  const initial = useGameStore.getState().barrels.get(barrelId);
  const targetPos = useRef(new Vector3());
  const targetQuat = useRef(new Quaternion());

  useFrame((_, delta) => {
    const b = useGameStore.getState().barrels.get(barrelId);
    if (!b || !group.current) return;
    targetPos.current.set(b.x, b.y, b.z);
    targetQuat.current.set(b.qx, b.qy, b.qz, b.qw);
    const t = 1 - Math.exp(-SMOOTH_RATE * delta);
    group.current.position.lerp(targetPos.current, t);
    group.current.quaternion.slerp(targetQuat.current, t);
  });

  const onAttack = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    clearDestination();
    sendAttack(barrelId);
    useTargetStore.getState().setTarget(barrelId);
  };

  return (
    <group
      ref={group}
      position={initial ? [initial.x, initial.y, initial.z] : [0, HALF_HEIGHT, 0]}
      quaternion={initial ? [initial.qx, initial.qy, initial.qz, initial.qw] : [0, 0, 0, 1]}
    >
      {/* Shift the drum down by its half-height so the group origin is its center
          (the physics pivot), so it tumbles about the middle in flight. */}
      <group position={[0, -HALF_HEIGHT, 0]}>
        <AssetInstance id="prop.arena.drum.fire" />
      </group>
      {/* Invisible click target (the fire-drum itself is small/irregular). */}
      <mesh onPointerDown={onAttack}>
        <cylinderGeometry args={[0.7, 0.7, 1.5, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
