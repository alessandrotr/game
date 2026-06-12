import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCameraYaw, getCameraPitch } from '../store/cameraControl';
import { getCamera } from '../tuning';

/** Hard bounds on the total camera pitch (rad above horizontal) so tuning +
 *  user tilt can never look through the floor or flip fully top-down. */
const MIN_PITCH = 0.2;
const MAX_PITCH = 1.45;

/**
 * Fixed-angle isometric-style camera that smoothly follows the local player.
 * Distance, height and follow smoothing are read from the camera tuning each
 * frame, so Leva edits apply live.
 *
 * Orientation = a per-team base yaw plus a user yaw offset:
 *  - Base: red is mirrored 180° from blue. The arena is 180°-rotationally
 *    symmetric, so both teams get the identical view (each looks toward the
 *    enemy down the long-sightline axis) instead of one side staring into the
 *    camera's foreground. The minimap is flipped to match (see Minimap.tsx).
 *  - User: middle-mouse drag rotates the view to look around; middle-click
 *    recenters (see CameraControls). Click-to-move/aiming are world-space, so
 *    rotating the camera never affects controls.
 */
export function CameraRig() {
  const { camera } = useThree();
  const desired = new Vector3();
  const target = new Vector3();

  useFrame((_, delta) => {
    const { sessionId, players } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;

    // Prefer the client-predicted transform so the camera tracks smooth local
    // motion; fall back to the server snapshot before prediction starts.
    const local = getLocalRenderTransform();
    if (local.active) {
      target.set(local.x, 0, local.z);
    } else if (me) {
      target.set(me.x, 0, me.z);
    } else {
      return;
    }

    const cam = getCamera();
    // Base orientation: blue looks down +Z, red is mirrored 180°. The user yaw
    // offset orbits the view on top of that.
    const baseYaw = me?.team === 'red' ? Math.PI : 0;
    const yaw = baseYaw + getCameraYaw();
    // Tilt: orbit up/down at a constant radius from the player. The base pitch
    // comes from the tuned height/distance; the user offset adds a small ± tilt.
    const radius = Math.hypot(cam.distance, cam.height);
    const basePitch = Math.atan2(cam.height, cam.distance);
    const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, basePitch + getCameraPitch()));
    const horiz = radius * Math.cos(pitch);
    desired.set(
      target.x + Math.sin(yaw) * horiz,
      target.y + radius * Math.sin(pitch),
      target.z + Math.cos(yaw) * horiz,
    );
    const t = 1 - Math.exp(-cam.followSmoothing * delta);
    camera.position.lerp(desired, t);
    camera.lookAt(target);
  });

  return null;
}
