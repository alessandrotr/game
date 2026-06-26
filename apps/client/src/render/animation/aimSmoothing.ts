import { useRef } from 'react';

const TWO_PI = Math.PI * 2;

/** Ease an angle toward a target the short way around, frame-rate independent. */
export function approachAngle(current: number, target: number, dt: number, rate = 18): number {
  const diff = ((((target - current) % TWO_PI) + TWO_PI + Math.PI) % TWO_PI) - Math.PI;
  return current + diff * (1 - Math.exp(-rate * dt));
}

/**
 * Per-weapon smoother for a charge/hold AIM yaw.
 *
 * The LOCAL owner aims at frame rate (snap — zero latency). A REMOTE owner's
 * charge direction is replicated at only ~10Hz (the `SetCharge` stream), so
 * applying it raw makes the weapon lurch in steps; this eases the yaw so the
 * weapon glides instead — the same idea the snapshot buffer uses for position.
 *
 * Call `smooth(target, localOwner, dt)` each frame while aiming, and `reset()`
 * when the aim ends, so the next aim snaps to its start instead of sweeping in
 * from the previous pose.
 */
export function useAimYawSmoother(): {
  smooth: (target: number, localOwner: boolean, dt: number) => number;
  reset: () => void;
} {
  const yaw = useRef(0);
  const active = useRef(false);
  const smooth = (target: number, localOwner: boolean, dt: number): number => {
    yaw.current = localOwner || !active.current ? target : approachAngle(yaw.current, target, dt);
    active.current = true;
    return yaw.current;
  };
  const reset = (): void => {
    active.current = false;
  };
  return { smooth, reset };
}
