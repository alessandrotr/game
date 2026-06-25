import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';
import { getDestination } from '../store/destinationState';
import { isTouchDevice } from '../hooks/useIsTouch';

/**
 * Ground marker at the active move destination. Reads the destination
 * imperatively each frame (no re-renders) and hides itself when there is none —
 * which the prediction clears on arrival.
 *
 * Not shown on touch devices: there the floating joystick drives movement by
 * continuously projecting a destination ahead of the player, so a marker would
 * just hover under their feet rather than mark a click target.
 */
export function DestinationMarker() {
  if (isTouchDevice()) return <TouchlessMarker />;
  return <DestinationMarkerImpl />;
}

/** Empty render for touch devices — keeps the hook order stable (the real
 *  component's `useFrame` is never mounted here). */
function TouchlessMarker() {
  return null;
}

function DestinationMarkerImpl() {
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
