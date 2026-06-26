import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { isRooted } from '@arena/shared';
import { setDestination, clearDestination } from '../store/destinationState';
import { getJoystickVector } from '../store/joystickState';
import { getLocalRenderTransform } from '../store/localPlayer';
import { useGameStore } from '../store/useGameStore';
import { useTargetStore } from '../store/targetState';
import { useFocusStore } from '../store/useFocusStore';
import { sendMoveTo, sendStopMove } from '../network/colyseus';

/** How far ahead the joystick destination is projected (world units). */
const LOOKAHEAD = 6;
/** Throttle for network destination updates (~25/s); prediction is per-frame. */
const SEND_INTERVAL = 0.04;

/**
 * Translates the mobile movement joystick (see `MobileJoystick` /
 * `joystickState`) into authoritative movement. Each frame the joystick's
 * screen-space direction is mapped to world space relative to the camera
 * (joystick-up = away from camera) and projected a few units ahead of the
 * player as a move destination — point-to-move, continuously re-targeted while
 * held. Releasing the joystick stops the player immediately (unlike a tap, a
 * joystick release means "stop here").
 *
 * Camera-relative WASD projection. Server stays authoritative; this only
 * reports the target.
 */
export function JoystickMove() {
  const camera = useThree((s) => s.camera);
  const fwdVec = useRef(new Vector3());
  const rightVec = useRef(new Vector3());
  const moving = useRef(false);
  const sendAccum = useRef(0);

  // A cinematic focus interrupts movement (camera leaves the player).
  const focused = useFocusStore((s) => !!s.target);
  useEffect(() => {
    if (!focused) return;
    if (moving.current) {
      moving.current = false;
      clearDestination();
      sendStopMove();
    }
  }, [focused]);

  useFrame((_, delta) => {
    if (useFocusStore.getState().target) return;

    const joy = getJoystickVector();
    const me = (() => {
      const { sessionId, players } = useGameStore.getState();
      return sessionId ? players.get(sessionId) : undefined;
    })();

    // No input (or rooted / CC'd): stop once, then idle.
    if (joy.mag <= 0 || (me && isRooted(me))) {
      if (moving.current) {
        moving.current = false;
        clearDestination();
        sendStopMove();
      }
      return;
    }

    // Steering a move cancels any auto-attack chase the first frame it engages.
    if (!moving.current) useTargetStore.getState().setTarget(null);

    // Map the screen-space stick direction to world space relative to the camera:
    // forward = camera look flattened, right = forward × up. Joystick "up"
    // (negative screen-y) moves away from the camera.
    camera.getWorldDirection(fwdVec.current);
    fwdVec.current.y = 0;
    fwdVec.current.normalize();
    rightVec.current.set(-fwdVec.current.z, 0, fwdVec.current.x);
    let dx = fwdVec.current.x * -joy.dy + rightVec.current.x * joy.dx;
    let dz = fwdVec.current.z * -joy.dy + rightVec.current.z * joy.dx;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    const t = getLocalRenderTransform();
    const targetX = t.x + dx * LOOKAHEAD;
    const targetZ = t.z + dz * LOOKAHEAD;
    setDestination(targetX, targetZ);
    moving.current = true;
    sendAccum.current += delta;
    if (sendAccum.current >= SEND_INTERVAL) {
      sendAccum.current = 0;
      sendMoveTo(targetX, targetZ);
    }
  });

  return null;
}
