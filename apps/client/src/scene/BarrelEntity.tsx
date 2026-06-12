import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import { useGameStore } from '../store/useGameStore';
import { useTargetStore } from '../store/targetState';
import { clearDestination } from '../store/destinationState';
import { sendAttack } from '../network/colyseus';
import { AssetInstance } from '../render/AssetInstance';

/**
 * A live, interactive burning barrel rendered from replicated state. The visual
 * is the same fire-drum prop; an invisible collider makes it left-clickable so
 * the player can auto-attack it (the server then launches + detonates it). Its
 * position is driven imperatively from the latest snapshot each frame so the
 * server-integrated launch arc is reflected without per-tick React re-renders.
 */
export function BarrelEntity({ barrelId }: { barrelId: string }) {
  const group = useRef<Group>(null);
  const initial = useGameStore.getState().barrels.get(barrelId);

  useFrame(() => {
    const b = useGameStore.getState().barrels.get(barrelId);
    if (b && group.current) group.current.position.set(b.x, b.y, b.z);
  });

  const onAttack = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    clearDestination();
    sendAttack(barrelId);
    useTargetStore.getState().setTarget(barrelId);
  };

  return (
    <group ref={group} position={initial ? [initial.x, initial.y, initial.z] : [0, 0, 0]}>
      <AssetInstance id="prop.arena.drum.fire" />
      {/* Invisible click target (the fire-drum itself is small/irregular). */}
      <mesh position={[0, 0.7, 0]} onPointerDown={onAttack}>
        <cylinderGeometry args={[0.7, 0.7, 1.5, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
