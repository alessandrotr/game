import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { livingTeammates, useCoopStore } from '../store/useCoopStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getFpsAim, isFpsEngaged } from '../store/fpsAim';
import { getCameraYaw, getCameraPitch, getCameraZoom } from '../store/cameraControl';
import { getCamera } from '../tuning';

/** Hard bounds on the total camera pitch (rad above horizontal) so tuning +
 *  user tilt can never look through the floor or flip fully top-down. */
const MIN_PITCH = 0.2;
const MAX_PITCH = 1.45;

/** Gun Mode Zombie (first-person camera): eye height above the feet (world
 *  units) and how tightly the camera position tracks the predicted body. */
const GUN_EYE_HEIGHT = 1.6;
const GUN_POS_SMOOTH = 24;
/** Wider field of view in first person (vs the follow camera's 55°) for the
 *  open, fast-reading feel of an FPS. */
const GUN_FOV = 90;
const FOLLOW_FOV = 55;

/** Set the camera's vertical FOV (no-op if unchanged — avoids a per-frame
 *  projection-matrix rebuild). */
function setFov(camera: PerspectiveCamera, fov: number): void {
  if (camera.fov === fov) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

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
  // Smoothed first-person eye position in gun mode (null until it initializes).
  const eye = useRef<Vector3 | null>(null);

  useFrame((_, delta) => {
    const { sessionId, players } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;

    // Co-op spectating: when dead and watching the squad, follow the chosen
    // (living) teammate instead of our own corpse — fall back to any survivor.
    const coop = useCoopStore.getState();
    if (coop.phase === 'spectating' && me && !me.alive) {
      const watched = coop.spectateTargetId ? players.get(coop.spectateTargetId) : undefined;
      const focus =
        watched && watched.alive ? watched : livingTeammates(players, sessionId)[0];
      if (focus) {
        target.set(focus.x, 0, focus.z);
        applyOrbit(camera, target, desired, me, delta);
        return;
      }
    }

    // Prefer the client-predicted transform so the camera tracks smooth local
    // motion; fall back to the server snapshot before prediction starts.
    const local = getLocalRenderTransform();

    const { gunMode, gunView } = useGameStore.getState();
    if (gunMode && local.active && gunView === 'fps') {
      // First person: the eye sits at the player's head and looks along the
      // mouse-look yaw/pitch; the body faces the same way (see PlayerEntity), and
      // the local model is hidden so we're not inside it.
      if (camera instanceof PerspectiveCamera) setFov(camera, GUN_FOV);
      const aim = getFpsAim();
      const yaw = isFpsEngaged() ? aim.yaw : local.rotation;
      const pitch = isFpsEngaged() ? aim.pitch : 0;
      // Track the head position tightly (a light smoothing kills prediction jitter).
      const k = 1 - Math.exp(-GUN_POS_SMOOTH * delta);
      eye.current ??= new Vector3(local.x, GUN_EYE_HEIGHT, local.z);
      eye.current.x = MathUtils.lerp(eye.current.x, local.x, k);
      eye.current.z = MathUtils.lerp(eye.current.z, local.z, k);
      eye.current.y = GUN_EYE_HEIGHT;
      camera.position.copy(eye.current);
      const cp = Math.cos(pitch);
      target.set(
        eye.current.x + Math.sin(yaw) * cp,
        eye.current.y + Math.sin(pitch),
        eye.current.z + Math.cos(yaw) * cp,
      );
      camera.lookAt(target);
      return;
    }
    if (gunMode && local.active && gunView === 'topdown') {
      // Top-down: a fixed, predictable shooter cam centered on the player — no
      // aim-lead. Same orbit as the normal follow, just with locked orientation.
      if (camera instanceof PerspectiveCamera) setFov(camera, FOLLOW_FOV);
      eye.current = null;
      target.set(local.x, 0, local.z);
      applyOrbit(camera, target, desired, me, delta, true /* lockOrientation */);
      return;
    }
    eye.current = null; // reset so re-entering gun mode starts fresh
    if (camera instanceof PerspectiveCamera) setFov(camera, FOLLOW_FOV);

    if (local.active) {
      target.set(local.x, 0, local.z);
    } else if (me) {
      target.set(me.x, 0, me.z);
    } else {
      return;
    }

    applyOrbit(camera, target, desired, me, delta);
  });

  return null;
}

/** Position the camera at the tuned orbit around `target` and look at it. Shared
 *  by the normal follow and the co-op spectate follow. `me` only supplies the
 *  per-team base yaw (the local player's side), so spectating keeps your view. */
function applyOrbit(
  camera: { position: Vector3; lookAt: (v: Vector3) => void },
  target: Vector3,
  desired: Vector3,
  me: { team?: string } | undefined,
  delta: number,
  lockOrientation = false,
): void {
  const cam = getCamera();
  // Base orientation: blue looks down +Z, red is mirrored 180°. The user yaw
  // offset orbits the view on top of that — unless the orientation is locked
  // (the top-down Gun Mode camera keeps a fixed, predictable view).
  const baseYaw = me?.team === 'red' ? Math.PI : 0;
  const yaw = baseYaw + (lockOrientation ? 0 : getCameraYaw());
  // Tilt: orbit up/down at a constant radius from the player. The base pitch
  // comes from the tuned height/distance; the user offset adds a small ± tilt.
  const radius = Math.hypot(cam.distance, cam.height) * getCameraZoom();
  const basePitch = Math.atan2(cam.height, cam.distance);
  const pitch = Math.min(
    MAX_PITCH,
    Math.max(MIN_PITCH, basePitch + (lockOrientation ? 0 : getCameraPitch())),
  );
  const horiz = radius * Math.cos(pitch);
  desired.set(
    target.x + Math.sin(yaw) * horiz,
    target.y + radius * Math.sin(pitch),
    target.z + Math.cos(yaw) * horiz,
  );
  const t = 1 - Math.exp(-cam.followSmoothing * delta);
  camera.position.lerp(desired, t);
  camera.lookAt(target);
}
