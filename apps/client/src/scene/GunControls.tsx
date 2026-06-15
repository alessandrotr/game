import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { GUNS, isGunKind, isRooted } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCursorGround } from '../store/cursorState';
import { addFpsLook, getFpsAim, isFpsEngaged, resetFpsAim, seedFpsYaw } from '../store/fpsAim';
import { setDestination, clearDestination } from '../store/destinationState';
import {
  sendAimWeapon,
  sendFireWeapon,
  sendMoveTo,
  sendReloadWeapon,
  sendStopMove,
  sendSwitchWeapon,
} from '../network/colyseus';

/** How far ahead the WASD destination is projected (world units). */
const LOOKAHEAD = 6;
/** Mouse-look sensitivity (radians per pixel) for the first-person view. */
const LOOK_SENSITIVITY = 0.0022;
/** Throttle for authoritative move/aim updates (~20/s); prediction is per-frame. */
const MOVE_SEND_INTERVAL = 0.05;
const AIM_SEND_INTERVAL = 0.06;

/**
 * Gun Mode Zombie input. Two interchangeable schemes, toggled live with **V**
 * (the choice is a `useGameStore.gunView` preference):
 *
 *  - **First person** (`fps`): click to pointer-lock; mouse looks around (the
 *    body faces the look); WASD moves relative to facing; right-click fires down
 *    the center crosshair.
 *  - **Top-down** (`topdown`): a locked over-the-shoulder shooter cam; the mouse
 *    cursor aims (the body faces it); WASD moves camera-relative; right-click
 *    fires toward the cursor.
 *
 * Both share guns: hold for the machine gun, one shot per click for the pistol;
 * 3/4 switch weapons; R reloads. Movement reuses the destination-based server
 * movement (a moving MoveTo target), so collision/speed/prediction are identical.
 */
export function GunControls() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  const keys = useRef({ w: false, a: false, s: false, d: false });
  const firing = useRef(false);
  const wasMoving = useRef(false);
  const fireCooldown = useRef(0);
  const moveAccum = useRef(0);
  const aimAccum = useRef(0);
  // Scratch vectors for the top-down camera-relative basis (avoid per-frame alloc).
  const fwdVec = useRef(new Vector3());
  const rightVec = useRef(new Vector3());

  useEffect(() => {
    const canvas = gl.domElement;
    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const isFps = () => useGameStore.getState().gunView === 'fps';
    const locked = () => document.pointerLockElement === canvas;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isTyping()) return;
      switch (e.code) {
        case 'KeyW':
          keys.current.w = true;
          break;
        case 'KeyA':
          keys.current.a = true;
          break;
        case 'KeyS':
          keys.current.s = true;
          break;
        case 'KeyD':
          keys.current.d = true;
          break;
        case 'Digit3':
          sendSwitchWeapon(3);
          break;
        case 'Digit4':
          sendSwitchWeapon(4);
          break;
        case 'KeyR':
          sendReloadWeapon();
          break;
        case 'KeyV':
          useGameStore.getState().toggleGunView();
          // Leaving first person releases the mouse; entering it waits for a click.
          if (!isFps() && locked()) document.exitPointerLock();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
          keys.current.w = false;
          break;
        case 'KeyA':
          keys.current.a = false;
          break;
        case 'KeyS':
          keys.current.s = false;
          break;
        case 'KeyD':
          keys.current.d = false;
          break;
        default:
          return;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isFps() && !locked()) {
        // First click captures the mouse for look control (no shot fired).
        seedFpsYaw(getLocalRenderTransform().rotation);
        void canvas.requestPointerLock();
        return;
      }
      if (e.button === 2) {
        firing.current = true;
        fireCooldown.current = 0; // fire on the next frame
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) firing.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isFps() || !locked()) return;
      addFpsLook(-e.movementX * LOOK_SENSITIVITY, -e.movementY * LOOK_SENSITIVITY);
    };
    const onLockChange = () => {
      if (!locked()) {
        firing.current = false;
        keys.current = { w: false, a: false, s: false, d: false };
      }
    };
    const onContextMenu = (ev: Event) => ev.preventDefault();
    const onBlur = () => {
      keys.current = { w: false, a: false, s: false, d: false };
      firing.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      resetFpsAim();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const { sessionId, players, gunView } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;
    if (!me || !me.alive) return;
    const t = getLocalRenderTransform();
    const fps = gunView === 'fps';

    // --- Aim direction -------------------------------------------------------
    // First person: along the mouse-look yaw. Top-down: toward the cursor ground.
    let aimX: number;
    let aimZ: number;
    const yaw = isFpsEngaged() ? getFpsAim().yaw : t.rotation;
    if (fps) {
      aimX = Math.sin(yaw);
      aimZ = Math.cos(yaw);
    } else {
      const cur = getCursorGround();
      aimX = cur.x - t.x;
      aimZ = cur.z - t.z;
      const len = Math.hypot(aimX, aimZ);
      if (len > 1e-3) {
        aimX /= len;
        aimZ /= len;
      } else {
        aimX = Math.sin(t.rotation);
        aimZ = Math.cos(t.rotation);
      }
    }

    aimAccum.current += delta;
    if (aimAccum.current >= AIM_SEND_INTERVAL) {
      aimAccum.current = 0;
      sendAimWeapon(aimX, aimZ);
    }

    // --- Fire ----------------------------------------------------------------
    fireCooldown.current -= delta;
    if (firing.current && fireCooldown.current <= 0) {
      const gun = isGunKind(me.equippedGun) ? GUNS[me.equippedGun] : GUNS.pistol;
      sendFireWeapon(aimX, aimZ);
      fireCooldown.current = gun.fireRateMs / 1000;
      if (!gun.automatic) firing.current = false; // pistol: one shot per click
    }

    // --- Move ----------------------------------------------------------------
    if (isRooted(me)) {
      if (wasMoving.current) {
        wasMoving.current = false;
        clearDestination();
      }
      return;
    }

    const fwd = (keys.current.w ? 1 : 0) - (keys.current.s ? 1 : 0);
    const strafe = (keys.current.d ? 1 : 0) - (keys.current.a ? 1 : 0);
    if (fwd === 0 && strafe === 0) {
      if (wasMoving.current) {
        wasMoving.current = false;
        clearDestination();
        sendStopMove();
      }
      return;
    }

    let dx: number;
    let dz: number;
    if (fps) {
      // Yaw-relative: forward = (sin,cos); strafe-right = (-cos, sin).
      dx = Math.sin(yaw) * fwd - Math.cos(yaw) * strafe;
      dz = Math.cos(yaw) * fwd + Math.sin(yaw) * strafe;
    } else {
      // Camera-relative: forward = camera look flattened; right = forward × up.
      camera.getWorldDirection(fwdVec.current);
      fwdVec.current.y = 0;
      fwdVec.current.normalize();
      rightVec.current.set(-fwdVec.current.z, 0, fwdVec.current.x);
      dx = fwdVec.current.x * fwd + rightVec.current.x * strafe;
      dz = fwdVec.current.z * fwd + rightVec.current.z * strafe;
    }
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    const targetX = t.x + dx * LOOKAHEAD;
    const targetZ = t.z + dz * LOOKAHEAD;
    setDestination(targetX, targetZ);
    wasMoving.current = true;
    moveAccum.current += delta;
    if (moveAccum.current >= MOVE_SEND_INTERVAL) {
      moveAccum.current = 0;
      sendMoveTo(targetX, targetZ);
    }
  });

  return null;
}
