import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCamera } from '../tuning';

/** Min travel speed (world units/s) before the camera re-aims behind movement —
 *  below it the yaw holds, so standing still or attacking in place doesn't spin
 *  the view. */
const REORIENT_SPEED = 0.8;
/** Yaw easing rate (higher = snappier turns toward the travel direction). */
const YAW_SMOOTHING = 6;

/** Shortest-path angular lerp (handles the ±π wrap). */
function lerpAngle(from: number, to: number, t: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
}

/**
 * Third-person follow camera that trails the local player from behind their
 * travel direction. The yaw only updates while the player is actually moving
 * (it holds when stopped or attacking in place), so point-and-click play doesn't
 * whip the view around every time the character re-faces a target. Distance,
 * height and follow smoothing come from the camera tuning, read each frame so
 * Leva edits apply live.
 *
 * A behind-camera is inherently fair for both teams (it's relative to the
 * player's own motion), so there's no per-team mirroring here.
 */
export function CameraRig() {
  const { camera } = useThree();
  const desired = new Vector3();
  const target = new Vector3();
  // Persisted across frames: the smoothed camera yaw and the previous target
  // position used to derive the travel direction.
  const yaw = useRef<number | null>(null);
  const prev = useRef<{ x: number; z: number } | null>(null);

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

    // First frame: aim the camera toward the arena center (so you spawn looking
    // into the fight, not at the back wall) and seed the travel tracker.
    if (yaw.current === null) yaw.current = Math.atan2(-target.x, -target.z);
    if (!prev.current) prev.current = { x: target.x, z: target.z };

    // Re-aim behind the travel direction only while genuinely moving.
    const dx = target.x - prev.current.x;
    const dz = target.z - prev.current.z;
    prev.current.x = target.x;
    prev.current.z = target.z;
    const speed = delta > 0 ? Math.hypot(dx, dz) / delta : 0;
    if (speed > REORIENT_SPEED) {
      const travelYaw = Math.atan2(dx, dz);
      yaw.current = lerpAngle(yaw.current, travelYaw, 1 - Math.exp(-YAW_SMOOTHING * delta));
    }

    const cam = getCamera();
    // Sit behind the character along the (smoothed) travel yaw, raised by height.
    desired.set(
      target.x - Math.sin(yaw.current) * cam.distance,
      target.y + cam.height,
      target.z - Math.cos(yaw.current) * cam.distance,
    );
    const t = 1 - Math.exp(-cam.followSmoothing * delta);
    camera.position.lerp(desired, t);
    camera.lookAt(target);
  });

  return null;
}
