import { useMemo, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';

interface FollowCameraProps {
  /** The object to follow. */
  target: RefObject<Group | null>;
  /** Camera position relative to the target. */
  offset?: [number, number, number];
  /** Height above the target the camera looks at. */
  lookAtHeight?: number;
  /** Follow stiffness (1/second). Higher = tighter, lower = floatier. */
  stiffness?: number;
}

/**
 * Smooth third-person follow camera. Eases toward `target.position + offset`
 * each frame (delta-time exponential smoothing) and looks at the target.
 */
export function FollowCamera({
  target,
  offset = [0, 6, 9],
  lookAtHeight = 1.2,
  stiffness = 8,
}: FollowCameraProps) {
  const camera = useThree((s) => s.camera);
  const offsetVec = useMemo(() => new Vector3(...offset), [offset]);
  const scratch = useMemo(() => ({ desired: new Vector3(), look: new Vector3() }), []);

  useFrame((_, rawDelta) => {
    const group = target.current;
    if (!group) return;

    const dt = Math.min(rawDelta, 0.1);
    scratch.desired.copy(group.position).add(offsetVec);

    const t = 1 - Math.exp(-stiffness * dt);
    camera.position.lerp(scratch.desired, t);

    scratch.look.copy(group.position);
    scratch.look.y += lookAtHeight;
    camera.lookAt(scratch.look);
  });

  return null;
}
