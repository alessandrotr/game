import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';
import { getDestination } from '../store/destinationState';

/**
 * Ground marker at the active move destination. Reads the destination
 * imperatively each frame (no re-renders) and hides itself when there is none —
 * which the prediction clears on arrival.
 */
export function DestinationMarker() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const dest = getDestination();
    node.visible = dest.active;
    if (!dest.active) return;
    node.position.set(dest.x, 0.03, dest.z);
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.12;
    node.scale.setScalar(pulse);
  });

  return (
    <group ref={group} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.5, 32]} />
        <meshBasicMaterial color="#6c8cff" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}
