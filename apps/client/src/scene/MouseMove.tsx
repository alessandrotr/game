import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { setDestination } from '../store/destinationState';
import { getLocalRenderTransform } from '../store/localPlayer';
import { useTargetStore } from '../store/targetState';
import { getTuning } from '../tuning';
import { sendMoveTo } from '../network/colyseus';

/** Ground plane (y = 0) the cursor is projected onto. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);
/** Throttle for network destination updates (~25/s); prediction still updates every frame. */
const SEND_INTERVAL = 0.04;

/**
 * Mouse movement (right mouse button). A click sets a destination the
 * character walks to and stops at (point-to-move); holding continuously
 * re-targets the cursor (drag-to-steer). Releasing keeps the last destination
 * so the character finishes the walk — it stops on arrival, not on release.
 * Re-raycasting each frame is required because the follow-camera moves, so a
 * stationary cursor maps to a moving world point.
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
  const lastTarget = useRef<{ x: number; z: number } | null>(null);
  const sendAccum = useRef(0);
  const raycaster = useRef(new Raycaster());
  const ndc = useRef(new Vector2());
  const point = useRef(new Vector3());

  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // right button only
      held.current = true;
      screen.current = { x: e.clientX, y: e.clientY };
      sendAccum.current = SEND_INTERVAL; // send on the first frame
      useTargetStore.getState().setTarget(null); // a move order cancels auto-attack
    };
    const onMove = (e: MouseEvent) => {
      screen.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 2 || !held.current) return;
      held.current = false;
      // Keep the last destination: the character finishes walking to it and
      // stops on arrival (point-to-move). Send a final authoritative target.
      if (lastTarget.current) sendMoveTo(lastTarget.current.x, lastTarget.current.z);
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!held.current) return;

    const rect = gl.domElement.getBoundingClientRect();
    ndc.current.set(
      ((screen.current.x - rect.left) / rect.width) * 2 - 1,
      -(((screen.current.y - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.current.setFromCamera(ndc.current, camera);
    if (!raycaster.current.ray.intersectPlane(GROUND, point.current)) return;

    // Lock sprint-vs-walk on the player→target distance (matches the server).
    const me = getLocalRenderTransform();
    const targetDist = Math.hypot(point.current.x - me.x, point.current.z - me.z);
    const sprint = targetDist > getTuning().player.sprintThreshold;

    // Update local prediction every frame; throttle the authoritative update.
    setDestination(point.current.x, point.current.z, sprint);
    lastTarget.current = { x: point.current.x, z: point.current.z };
    sendAccum.current += delta;
    if (sendAccum.current >= SEND_INTERVAL) {
      sendAccum.current = 0;
      sendMoveTo(point.current.x, point.current.z);
    }
  });

  return null;
}
