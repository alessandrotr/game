import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  addCameraYaw,
  addCameraPitch,
  addCameraHeightScrollOffset,
  addCameraZoom,
  resetCameraView,
} from '../store/cameraControl';
import { useCameraPrefsStore } from '../store/useCameraPrefsStore';
import { useHudStore } from '../store/useHudStore';
import { useFocusStore } from '../store/useFocusStore';
import { isTouchDevice } from '../hooks/useIsTouch';

/** Rotation per pixel of middle-drag (radians) — same feel for yaw and pitch. */
const DRAG_SENSITIVITY = 0.006;
/** Rotation per pixel of a one-finger look-drag on touch (right screen zone). A
 *  touch slightly more sensitive than the mouse so a thumb swipe spins enough. */
const TOUCH_LOOK_SENSITIVITY = 0.008;
/** Zoom (radius multiplier) change per pixel of pinch-spread. */
const PINCH_ZOOM_SENSITIVITY = 0.004;
/** Rotation per second while an arrow key is held (radians/s). */
const KEY_SPEED = 1.8;
/** Peak A/D orbit speed — 30% faster than the arrow keys, approached via easing. */
const AD_KEY_SPEED = KEY_SPEED * 1.3;
/** Easing rate (1/s) for A/D yaw: the angular velocity eases toward its target
 *  (ease-in on press) and back to 0 (ease-out on release) at this rate. Higher =
 *  snappier ramp (≈1/AD_EASE seconds to ~63% of peak). */
const AD_EASE = 14;
/** Height change per unit of wheel delta. */
const HEIGHT_SCROLL_SENSITIVITY = 0.015;
/** Zoom (radius multiplier) change per unit of wheel delta. */
const ZOOM_SENSITIVITY = 0.001;
/** Below this total drag (px), the middle press counts as a click → recenter. */
const CLICK_SLOP = 4;

/**
 * Manual camera rotation, layered on the fixed follow-camera ({@link CameraRig}).
 * Two input paths so it works on any device:
 *  - **← / →** orbit (yaw) at a constant rate; **A / D** orbit (yaw) too but
 *    inverted and eased (ramps in/out); **↑ / ↓** tilt (pitch). Held = continuous.
 *  - **Middle-mouse drag** orbits (horizontal) and tilts (vertical); a
 *    middle-click recenters both (mouse only — many laptops/trackpads have no
 *    middle button, hence the keyboard path above).
 *
 * Tilt is clamped small (see cameraControl). Movement and aiming are world-space
 * (re-raycast each frame), so rotating the view never disturbs them.
 */
export function CameraControls() {
  const gl = useThree((s) => s.gl);
  // -1 / +1 / 0 for held arrow keys (constant-rate yaw / pitch).
  const yawDir = useRef(0);
  const pitchDir = useRef(0);
  // A/D held direction (inverted vs the arrows) and its eased angular velocity.
  const adDir = useRef(0);
  const adVel = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return; // middle button only
      e.preventDefault(); // suppress middle-click autoscroll
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      moved = 0;
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      const prefs = useCameraPrefsStore.getState().prefs;
      if (!prefs.lockRotation) addCameraYaw(-dx * DRAG_SENSITIVITY);
      const pitchDelta = -dy * DRAG_SENSITIVITY; // drag up (>0) → tilt toward top-down
      if ((pitchDelta > 0 && !prefs.lockTiltUp) || (pitchDelta < 0 && !prefs.lockTiltDown)) {
        addCameraPitch(pitchDelta);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 1 || !dragging) return;
      dragging = false;
      if (moved < CLICK_SLOP) resetCameraView(); // a click recenters the view
    };

    // Wheel adjusts camera zoom or height based on cameraControlMode.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // don't scroll the page
      if (useCameraPrefsStore.getState().prefs.lockZoom) return;

      const mode = useHudStore.getState().cameraControlMode;
      if (mode === 2) {
        addCameraHeightScrollOffset(e.deltaY * HEIGHT_SCROLL_SENSITIVITY);
      } else {
        addCameraZoom(e.deltaY * ZOOM_SENSITIVITY);
      }
    };

    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.code === 'ArrowLeft')
        yawDir.current = -1; // orbit left
      else if (e.code === 'ArrowRight')
        yawDir.current = 1; // orbit right
      else if (e.code === 'KeyA')
        adDir.current = 1; // A → orbit right (inverted)
      else if (e.code === 'KeyD')
        adDir.current = -1; // D → orbit left (inverted)
      else if (e.code === 'ArrowUp')
        pitchDir.current = 1; // tilt toward top-down
      else if (e.code === 'ArrowDown')
        pitchDir.current = -1; // tilt flatter
      else return;
      e.preventDefault(); // don't scroll the page
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' && yawDir.current === -1) yawDir.current = 0;
      else if (e.code === 'ArrowRight' && yawDir.current === 1) yawDir.current = 0;
      else if (e.code === 'KeyA' && adDir.current === 1) adDir.current = 0;
      else if (e.code === 'KeyD' && adDir.current === -1) adDir.current = 0;
      else if (e.code === 'ArrowUp' && pitchDir.current === 1) pitchDir.current = 0;
      else if (e.code === 'ArrowDown' && pitchDir.current === -1) pitchDir.current = 0;
    };

    // --- Touch: right-zone look-drag (yaw) + two-finger pinch (zoom) ---------
    // Mobile camera control, twin-zone style: the move joystick owns the left
    // half of the screen, so the camera only claims touches that start on the
    // right half (and on the game world, not HUD chrome). One finger orbits the
    // view; two fingers pinch to zoom — the standard best-in-class mobile feel.
    const touchEnabled = isTouchDevice();
    // Camera-owned touches by identifier → last client position.
    const cam = new Map<number, { x: number; y: number }>();
    let pinchDist = 0; // baseline distance between the two pinch fingers

    const isCanvas = (el: EventTarget | null) => el instanceof HTMLCanvasElement;
    const inLookZone = (t: Touch) => isCanvas(t.target) && t.clientX >= window.innerWidth * 0.5;
    const pinchOf = () => {
      const pts = Array.from(cam.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (useFocusStore.getState().target) return; // locked during a focus
      for (const t of Array.from(e.changedTouches)) {
        if (cam.size >= 2) break;
        if (inLookZone(t)) cam.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (cam.size === 2) pinchDist = pinchOf();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (cam.size === 0) return;
      const prefs = useCameraPrefsStore.getState().prefs;
      for (const t of Array.from(e.changedTouches)) {
        const prev = cam.get(t.identifier);
        if (!prev) continue;
        // One finger → orbit (yaw). Pitch stays fixed (see cameraControl).
        if (cam.size === 1 && !prefs.lockRotation) {
          addCameraYaw(-(t.clientX - prev.x) * TOUCH_LOOK_SENSITIVITY);
        }
        cam.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      // Two fingers → pinch zoom (spread out = zoom in).
      if (cam.size === 2 && !prefs.lockZoom) {
        const d = pinchOf();
        if (pinchDist > 0) addCameraZoom(-(d - pinchDist) * PINCH_ZOOM_SENSITIVITY);
        pinchDist = d;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) cam.delete(t.identifier);
      pinchDist = cam.size === 2 ? pinchOf() : 0;
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    if (touchEnabled) {
      window.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    }
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (touchEnabled) {
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
      }
    };
  }, [gl]);

  // Rotate/tilt while a key is held (pitch self-clamps), subject to the
  // account's camera locks. Arrows are constant-rate; A/D are eased.
  useFrame((_, delta) => {
    const prefs = useCameraPrefsStore.getState().prefs;
    if (yawDir.current !== 0 && !prefs.lockRotation) {
      addCameraYaw(yawDir.current * KEY_SPEED * delta);
    }
    if (pitchDir.current > 0 && !prefs.lockTiltUp) addCameraPitch(KEY_SPEED * delta);
    else if (pitchDir.current < 0 && !prefs.lockTiltDown) addCameraPitch(-KEY_SPEED * delta);

    // A/D yaw: ease the angular velocity toward the held direction's peak speed
    // (ease-in on press) and back to 0 on release (ease-out). Exponential
    // smoothing keeps the curve frame-rate-independent; lockRotation eases it to
    // a standstill rather than cutting abruptly.
    const adTarget = prefs.lockRotation ? 0 : adDir.current * AD_KEY_SPEED;
    adVel.current += (adTarget - adVel.current) * (1 - Math.exp(-AD_EASE * delta));
    if (Math.abs(adVel.current) > 1e-4) addCameraYaw(adVel.current * delta);
  });

  return null;
}
