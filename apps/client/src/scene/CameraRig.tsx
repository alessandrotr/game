import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCamera } from '../tuning';

/**
 * Fixed-angle isometric-style camera that smoothly follows the local player.
 * Distance, height and follow smoothing are read from the camera tuning each
 * frame, so Leva edits apply live with no refresh.
 *
 * The camera is mirrored 180° for the red team (the offset sits on the −Z side
 * instead of +Z). The arena is 180°-rotationally symmetric, so this gives both
 * teams the identical view: each looks toward the enemy down the long-sightline
 * axis, instead of one side staring into the camera's foreground. The minimap is
 * flipped to match (see Minimap.tsx).
 */
export function CameraRig() {
  const { camera } = useThree();
  const desired = new Vector3();
  const target = new Vector3();

  useFrame((_, delta) => {
    const { sessionId, players } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;

    // Prefer the client-predicted transform so the camera tracks the smooth
    // local motion; fall back to the server snapshot before prediction starts.
    const local = getLocalRenderTransform();
    if (local.active) {
      target.set(local.x, 0, local.z);
    } else if (me) {
      target.set(me.x, 0, me.z);
    } else {
      return;
    }

    const cam = getCamera();
    // Red sits on the opposite side (−Z) so it also looks toward the enemy.
    const facing = me?.team === 'red' ? -1 : 1;
    desired.set(target.x, target.y + cam.height, target.z + cam.distance * facing);
    const t = 1 - Math.exp(-cam.followSmoothing * delta);
    camera.position.lerp(desired, t);
    camera.lookAt(target);
  });

  return null;
}
