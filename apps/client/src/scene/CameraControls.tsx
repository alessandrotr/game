import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { addCameraYaw, addCameraPitch, addCameraZoom, resetCameraView } from '../store/cameraControl';
import { useCameraPrefsStore } from '../store/useCameraPrefsStore';

/** Rotation per pixel of middle-drag (radians) — same feel for yaw and pitch. */
const DRAG_SENSITIVITY = 0.006;
/** Rotation per second while an arrow key is held (radians/s). */
const KEY_SPEED = 1.8;
/** Zoom (radius multiplier) change per unit of wheel delta. */
const ZOOM_SENSITIVITY = 0.001;
/** Below this total drag (px), the middle press counts as a click → recenter. */
const CLICK_SLOP = 4;

/**
 * Manual camera rotation, layered on the fixed follow-camera ({@link CameraRig}).
 * Two input paths so it works on any device:
 *  - **← / →** orbit (yaw), **↑ / ↓** tilt (pitch); all held = continuous.
 *  - **Middle-mouse drag** orbits (horizontal) and tilts (vertical); a
 *    middle-click recenters both (mouse only — many laptops/trackpads have no
 *    middle button, hence the keyboard path above).
 *
 * Tilt is clamped small (see cameraControl). Movement and aiming are world-space
 * (re-raycast each frame), so rotating the view never disturbs them.
 */
export function CameraControls() {
  const gl = useThree((s) => s.gl);
  // -1 / +1 / 0 for held arrow keys.
  const yawDir = useRef(0);
  const pitchDir = useRef(0);

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

    // Wheel zooms (scroll up = closer). Clamped to a gentle range in the store.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // don't scroll the page
      if (useCameraPrefsStore.getState().prefs.lockZoom) return;
      addCameraZoom(e.deltaY * ZOOM_SENSITIVITY);
    };

    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.code === 'ArrowLeft') yawDir.current = -1;
      else if (e.code === 'ArrowRight') yawDir.current = 1;
      else if (e.code === 'ArrowUp') pitchDir.current = 1; // tilt toward top-down
      else if (e.code === 'ArrowDown') pitchDir.current = -1; // tilt flatter
      else return;
      e.preventDefault(); // don't scroll the page
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' && yawDir.current === -1) yawDir.current = 0;
      else if (e.code === 'ArrowRight' && yawDir.current === 1) yawDir.current = 0;
      else if (e.code === 'ArrowUp' && pitchDir.current === 1) pitchDir.current = 0;
      else if (e.code === 'ArrowDown' && pitchDir.current === -1) pitchDir.current = 0;
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gl]);

  // Smoothly rotate/tilt while an arrow key is held (pitch self-clamps), subject
  // to the account's camera locks.
  useFrame((_, delta) => {
    const prefs = useCameraPrefsStore.getState().prefs;
    if (yawDir.current !== 0 && !prefs.lockRotation) {
      addCameraYaw(yawDir.current * KEY_SPEED * delta);
    }
    if (pitchDir.current > 0 && !prefs.lockTiltUp) addCameraPitch(KEY_SPEED * delta);
    else if (pitchDir.current < 0 && !prefs.lockTiltDown) addCameraPitch(-KEY_SPEED * delta);
  });

  return null;
}
