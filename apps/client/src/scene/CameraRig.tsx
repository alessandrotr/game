import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getTuning } from '../tuning';

/**
 * Fixed-angle isometric-style camera that smoothly follows the local player.
 * Distance, height and follow smoothing are read from the camera tuning each
 * frame, so Leva edits apply live with no refresh.
 */
export function CameraRig() {
  const { camera } = useThree();
  const desired = new Vector3();
  const target = new Vector3();

  useFrame((_, delta) => {
    // Prefer the client-predicted transform so the camera tracks the smooth
    // local motion; fall back to the server snapshot before prediction starts.
    const local = getLocalRenderTransform();
    if (local.active) {
      target.set(local.x, 0, local.z);
    } else {
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      if (!me) return;
      target.set(me.x, 0, me.z);
    }

    const cam = getTuning().camera;
    desired.set(target.x, target.y + cam.height, target.z + cam.distance);
    const t = 1 - Math.exp(-cam.followSmoothing * delta);
    camera.position.lerp(desired, t);
    camera.lookAt(target);
  });

  return null;
}
