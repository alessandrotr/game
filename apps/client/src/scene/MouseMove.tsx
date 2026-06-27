import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { isRooted } from '@arena/shared';
import { isTouchDevice } from '../hooks/useIsTouch';
import { setDestination, clearDestination } from '../store/destinationState';
import { useGameStore } from '../store/useGameStore';
import { useTargetStore } from '../store/targetState';
import { useAbilityTargeting } from '../store/abilityTargeting';
import { useFocusStore } from '../store/useFocusStore';
import { sendMoveTo, sendStopMove } from '../network/colyseus';

/** Ground plane (y = 0) the cursor is projected onto. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);
/** Throttle for network destination updates (~25/s); prediction still updates every frame. */
const SEND_INTERVAL = 0.04;
/** Cursor travel (px) past which a held click becomes a drag-to-steer (which walks
 *  straight to the cursor) rather than a click (which pathfinds around cover). */
const DRAG_THRESHOLD_PX = 6;

/**
 * Mouse movement (right mouse button). A click sets a destination the
 * character walks to and stops at (point-to-move); holding continuously
 * re-targets the cursor (drag-to-steer). Releasing keeps the last destination
 * so the character finishes the walk — it stops on arrival, not on release.
 * Re-raycasting each frame is required because the follow-camera moves, so a
 * stationary cursor maps to a moving world point.
 *
 * On touch devices (no right button), a one-finger tap/drag does the same thing:
 * it feeds the same `screen`/`held` refs and reuses the per-frame raycast below.
 *
 * Independent of abilities (separate input + messages). Walk/sprint by distance
 * and rotation are decided server-side; this only reports the target. Future
 * dash/blink/charge/knockback are server-driven displacements that compose on
 * top — they don't touch this component.
 */
export function MouseMove() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const held = useRef(false);
  const screen = useRef({ x: 0, y: 0 });
  // Where the press started + whether the cursor has moved enough to count as a
  // drag-to-steer (vs a click). A click pathfinds; a drag walks straight.
  const pressStart = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastTarget = useRef<{ x: number; z: number } | null>(null);
  const sendAccum = useRef(0);
  const raycaster = useRef(new Raycaster());
  const ndc = useRef(new Vector2());
  const point = useRef(new Vector3());

  // Engaging a cinematic focus INTERRUPTS movement: halt any in-progress walk (a
  // move order issued before the focus) so the player stops where they are while
  // the camera is off them — locally (prediction) and on the server.
  const focused = useFocusStore((s) => !!s.target);
  useEffect(() => {
    if (!focused) return;
    held.current = false;
    clearDestination();
    sendStopMove();
  }, [focused]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // right button only
      // Movement is locked while a structure is cinematically focused (the camera
      // is off the player); closing the panel restores control.
      if (useFocusStore.getState().target) return;
      // While aiming a ground-targeted ability, right-click cancels the aim
      // (it does not also issue a move order).
      if (useAbilityTargeting.getState().pending) {
        useAbilityTargeting.getState().cancel();
        return;
      }
      held.current = true;
      screen.current = { x: e.clientX, y: e.clientY };
      pressStart.current = { x: e.clientX, y: e.clientY };
      dragging.current = false;
      sendAccum.current = SEND_INTERVAL; // send on the first frame
      useTargetStore.getState().setTarget(null); // a move order cancels auto-attack
    };
    const onMove = (e: MouseEvent) => {
      screen.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 2 || !held.current) return;
      held.current = false;
      // On release the final point is a committed destination → route around cover
      // to reach it (a drag steers directly while held, but routes once let go).
      if (lastTarget.current) sendMoveTo(lastTarget.current.x, lastTarget.current.z, true);
    };

    // Touch: a single finger steers exactly like a held right-click. Multi-touch
    // (pinch/zoom) is ignored so it doesn't fight gestures.
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length !== 1) return;
      if (useFocusStore.getState().target) return; // locked while focused
      if (useAbilityTargeting.getState().pending) {
        useAbilityTargeting.getState().cancel();
        return;
      }
      held.current = true;
      screen.current = { x: t.clientX, y: t.clientY };
      pressStart.current = { x: t.clientX, y: t.clientY };
      dragging.current = false;
      sendAccum.current = SEND_INTERVAL;
      useTargetStore.getState().setTarget(null);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) screen.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = () => {
      if (!held.current) return;
      held.current = false;
      // Release commits to the final point → route around cover (see onUp).
      if (lastTarget.current) sendMoveTo(lastTarget.current.x, lastTarget.current.z, true);
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Touch devices use the floating joystick (see `MobileJoystick` /
    // `JoystickMove`) for movement instead of tap-to-walk, so the touch path is
    // only wired up where there's no coarse pointer.
    const touch = isTouchDevice();
    if (!touch) {
      canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    }
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!touch) {
        canvas.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
      }
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!held.current) return;
    // A focus can engage mid-drag (clicking a structure); stop steering at once.
    if (useFocusStore.getState().target) return;

    // Frozen (stun/root): the server ignores move orders and drops the
    // destination, so issuing one locally only races the predictor (which
    // clears it each frame) — that flip-flop was the residual rubber-band. Skip
    // setting a destination/marker or spamming the server while CC'd; holding
    // resumes movement automatically once it wears off.
    const { sessionId, players } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;
    if (me && isRooted(me)) return;

    const rect = gl.domElement.getBoundingClientRect();
    ndc.current.set(
      ((screen.current.x - rect.left) / rect.width) * 2 - 1,
      -(((screen.current.y - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.current.setFromCamera(ndc.current, camera);
    if (!raycaster.current.ray.intersectPlane(GROUND, point.current)) return;

    // Once the cursor has travelled past the threshold, this is a drag-to-steer:
    // walk straight to the cursor (no pathfinding) so manual steering isn't fought.
    if (!dragging.current) {
      const moved = Math.hypot(
        screen.current.x - pressStart.current.x,
        screen.current.y - pressStart.current.y,
      );
      if (moved > DRAG_THRESHOLD_PX) dragging.current = true;
    }
    const routed = !dragging.current;

    // Update local prediction every frame; throttle the authoritative update.
    setDestination(point.current.x, point.current.z, routed);
    lastTarget.current = { x: point.current.x, z: point.current.z };
    sendAccum.current += delta;
    if (sendAccum.current >= SEND_INTERVAL) {
      sendAccum.current = 0;
      sendMoveTo(point.current.x, point.current.z, routed);
    }
  });

  return null;
}
