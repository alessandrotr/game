import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { livingTeammates, useCoopStore } from '../store/useCoopStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getFpsAim, isFpsEngaged } from '../store/fpsAim';
import {
  getCameraYaw,
  getCameraPitch,
  getCameraZoom,
  getHeightScrollOffset,
} from '../store/cameraControl';
import { useFocusStore } from '../store/useFocusStore';
import { useHudStore } from '../store/useHudStore';
import { getCamera } from '../tuning';

/** Hard bounds on the total camera pitch (rad above horizontal) so tuning +
 *  user tilt can never look through the floor or flip fully top-down. */
const MIN_PITCH = 0.2;
const MAX_PITCH = 1.45;

/** Cinematic focus on a town structure (see useFocusStore). The camera glides to
 *  stand on the plaza side of the subject, looking at it, with the aim pushed to
 *  the right so the subject renders on the LEFT (leaving room for a right-docked
 *  panel). Tunables — adjust to taste against the real scene. */
const FOCUS_SMOOTH = 6; // exp-smoothing rate → ~0.45s glide in and out
const FOCUS_DIST = 7; // how far (world units) the camera sits from the subject
const FOCUS_HEIGHT = 3; // camera height above ground while focused
const FOCUS_LOOK_Y = 1.5; // height on the subject the camera aims at
/** Where the framed subject sits horizontally, as a fraction of the viewport
 *  (0 = left edge, 0.5 = center). The world side-shift is derived from this each
 *  frame using the live aspect ratio, so the subject lands at the SAME screen spot
 *  on every device — a fixed world shift would drift with aspect/resolution. The
 *  HUD title's left zone is sized so it sits under this subject without crowding
 *  the right-docked panel. */
export const FOCUS_SUBJECT_X = 0.34;

/** Where the subject sits VERTICALLY, as a fraction from the top (0.5 = center).
 *  Below 0.5 lifts it into the upper area so the bottom-docked HUD title (see
 *  FocusTitle) never sits over the model. Aspect-independent like the X shift. */
export const FOCUS_SUBJECT_Y = 0.4;

/** World side-shift that places a subject at distance `dist` (camera→subject) at
 *  `FOCUS_SUBJECT_X` horizontally, given the camera's vertical FOV + aspect. */
function focusSideShift(camera: PerspectiveCamera, dist: number): number {
  const hHalfFov = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  return (1 - 2 * FOCUS_SUBJECT_X) * dist * Math.tan(hHalfFov);
}

/** Downward look offset that lifts the subject to `FOCUS_SUBJECT_Y` on screen
 *  (aiming below it raises it in frame, clearing the bottom title text). */
function focusVertShift(camera: PerspectiveCamera, dist: number): number {
  const vHalfFov = (camera.fov * Math.PI) / 360;
  return (1 - 2 * FOCUS_SUBJECT_Y) * dist * Math.tan(vHalfFov);
}

// Scratch vectors for the focus math (allocated once, reused every frame).
const _focusDesired = new Vector3();
const _shiftedLook = new Vector3();
const _right = new Vector3();
const _viewDir = new Vector3();
const _up = new Vector3(0, 1, 0);

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
  // Scratch vectors reused every frame (allocated once per mount, not per render).
  const desired = useRef(new Vector3()).current;
  const target = useRef(new Vector3()).current;
  // Smoothed first-person eye position in gun mode (null until it initializes).
  const eye = useRef<Vector3 | null>(null);
  // Cinematic focus: the smoothed point the camera aims at, and whether we're still
  // animating (stays true through the return glide after the focus target clears).
  const focusLook = useRef(new Vector3()).current;
  const focusActive = useRef(false);

  useFrame((_, delta) => {
    const { sessionId, players } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;

    // Cinematic focus on a town structure. Takes over the camera while a focus
    // target is set (and through a short return glide afterward), gliding to frame
    // the subject screen-left. Gun mode wins (town has none, but be safe).
    const focusState = useFocusStore.getState();
    const focusTarget = focusState.target;
    const gunActive = useGameStore.getState().gunMode;
    if ((focusTarget || focusActive.current) && !gunActive) {
      const localT = getLocalRenderTransform();
      const px = localT.active ? localT.x : me?.x;
      const pz = localT.active ? localT.z : me?.z;
      if (camera instanceof PerspectiveCamera) setFov(camera, FOLLOW_FOV);
      const k = 1 - Math.exp(-FOCUS_SMOOTH * delta);

      if (focusTarget) {
        // Engage / hold: stand in FRONT of the structure (along its facing normal,
        // (sin,cos) of faceYaw), look at it, and bias the aim right so it sits
        // screen-left. Standing on the front means we view the face, not a side.
        const cx = focusTarget.x;
        const cz = focusTarget.z;
        const nx = Math.sin(focusState.faceYaw);
        const nz = Math.cos(focusState.faceYaw);
        _focusDesired.set(cx + nx * FOCUS_DIST, FOCUS_HEIGHT, cz + nz * FOCUS_DIST);
        if (!focusActive.current) {
          // Start the pan from where we were looking (the player) for continuity.
          focusLook.set(px ?? cx, FOCUS_LOOK_Y, pz ?? cz);
          focusActive.current = true;
        }
        camera.position.lerp(_focusDesired, k);
        _viewDir
          .set(cx - camera.position.x, FOCUS_LOOK_Y - camera.position.y, cz - camera.position.z)
          .normalize();
        _right.crossVectors(_viewDir, _up).normalize();
        // Aspect-aware shift: derive from the live FOV/aspect so the subject lands
        // at FOCUS_SUBJECT_X on every device (fixed world shift drifts with aspect).
        const dist = camera.position.distanceTo(_shiftedLook.set(cx, FOCUS_LOOK_Y, cz));
        const persp = camera instanceof PerspectiveCamera;
        const shift = persp ? focusSideShift(camera, dist) : 0;
        const vShift = persp ? focusVertShift(camera, dist) : 0;
        // Right-bias for screen-left, and aim below the subject so it rides high in
        // frame — both keep it clear of the right panel and the bottom title text.
        _shiftedLook.set(cx + _right.x * shift, FOCUS_LOOK_Y - vShift, cz + _right.z * shift);
        focusLook.lerp(_shiftedLook, k);
        camera.lookAt(focusLook);
        return;
      }

      // Return glide: focus cleared — ease back to the normal follow pose, then hand
      // control back to the standard rig (camera is already there, so no pop).
      if (px == null || pz == null) {
        focusActive.current = false;
      } else {
        target.set(px, 0, pz);
        orbitDesired(target, me, _focusDesired);
        camera.position.lerp(_focusDesired, k);
        focusLook.lerp(target, k);
        camera.lookAt(focusLook);
        if (
          camera.position.distanceToSquared(_focusDesired) < 0.05 &&
          focusLook.distanceToSquared(target) < 0.05
        ) {
          focusActive.current = false;
        }
        return;
      }
    }

    // Co-op spectating: when dead and watching the squad, follow the chosen
    // (living) teammate instead of our own corpse — fall back to any survivor.
    const coop = useCoopStore.getState();
    if (coop.phase === 'spectating' && me && !me.alive) {
      const watched = coop.spectateTargetId ? players.get(coop.spectateTargetId) : undefined;
      const focus = watched && watched.alive ? watched : livingTeammates(players, sessionId)[0];
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
  orbitDesired(target, me, desired, lockOrientation);
  const t = 1 - Math.exp(-getCamera().followSmoothing * delta);
  camera.position.lerp(desired, t);
  camera.lookAt(target);
}

/** Compute the tuned orbit camera position around `target` into `out` (no lerp, no
 *  lookAt). Shared by the live follow and the cinematic-focus return glide. */
function orbitDesired(
  target: Vector3,
  me: { team?: string } | undefined,
  out: Vector3,
  lockOrientation = false,
): void {
  const cam = getCamera();
  const mode = useHudStore.getState().cameraControlMode;
  const baseDistance = mode === 1 ? 13.5 : cam.distance;
  const baseHeight = mode === 1 ? 15.8 : cam.height;
  const effectiveHeight = baseHeight + (mode === 2 ? getHeightScrollOffset() : 0);
  const effectiveZoom = mode === 1 ? getCameraZoom() : 1;
  // Base orientation: blue looks down +Z, red is mirrored 180°. The user yaw
  // offset orbits the view on top of that — unless the orientation is locked
  // (the top-down Gun Mode camera keeps a fixed, predictable view).
  const baseYaw = me?.team === 'red' ? Math.PI : 0;
  const yaw = baseYaw + (lockOrientation ? 0 : getCameraYaw());
  // Tilt: orbit up/down at a constant radius from the player. The base pitch
  // comes from the tuned height/distance; the user offset adds a small ± tilt.
  const radius = Math.hypot(baseDistance, effectiveHeight) * effectiveZoom;
  const basePitch = Math.atan2(effectiveHeight, baseDistance);
  const pitch = Math.min(
    MAX_PITCH,
    Math.max(MIN_PITCH, basePitch + (lockOrientation ? 0 : getCameraPitch())),
  );
  const horiz = radius * Math.cos(pitch);
  out.set(
    target.x + Math.sin(yaw) * horiz,
    target.y + radius * Math.sin(pitch),
    target.z + Math.cos(yaw) * horiz,
  );
}
