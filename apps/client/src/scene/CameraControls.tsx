import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { addCameraYaw, resetCameraYaw } from '../store/cameraControl';

/** Yaw rotation per pixel of horizontal middle-drag (radians). */
const DRAG_SENSITIVITY = 0.006;
/** Yaw rotation per second while an arrow key is held (radians/s). */
const KEY_SPEED = 1.8;
/** Below this total drag (px), the middle press counts as a click → recenter. */
const CLICK_SLOP = 4;

/**
 * Manual camera rotation, layered on the fixed follow-camera ({@link CameraRig}).
 * Two input paths so it works on any device:
 *  - **← / →** rotate the view (held = continuous); **↓** recenters.
 *  - **Middle-mouse drag** rotates; a middle-click recenters (mouse only — many
 *    laptops/trackpads have no middle button, hence the keyboard path above).
 *
 * Movement and aiming are world-space (re-raycast each frame), so rotating the
 * view never disturbs them.
 */
export function CameraControls() {
  const gl = useThree((s) => s.gl);
  // -1 = rotating left, +1 = rotating right, 0 = idle (held arrow keys).
  const keyDir = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let moved = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return; // middle button only
      e.preventDefault(); // suppress middle-click autoscroll
      dragging = true;
      lastX = e.clientX;
      moved = 0;
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      addCameraYaw(-dx * DRAG_SENSITIVITY);
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 1 || !dragging) return;
      dragging = false;
      if (moved < CLICK_SLOP) resetCameraYaw(); // a click recenters the view
    };

    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.code === 'ArrowLeft') keyDir.current = -1;
      else if (e.code === 'ArrowRight') keyDir.current = 1;
      else if (e.code === 'ArrowDown') resetCameraYaw();
      else return;
      e.preventDefault(); // don't scroll the page
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' && keyDir.current === -1) keyDir.current = 0;
      else if (e.code === 'ArrowRight' && keyDir.current === 1) keyDir.current = 0;
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gl]);

  // Smoothly rotate while an arrow key is held.
  useFrame((_, delta) => {
    if (keyDir.current !== 0) addCameraYaw(keyDir.current * KEY_SPEED * delta);
  });

  return null;
}
