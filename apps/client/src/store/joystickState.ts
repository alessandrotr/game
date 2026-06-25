import { create } from 'zustand';

/**
 * State for the mobile floating movement joystick. A touch that lands on the
 * game world (the canvas) spawns the joystick at the touch point; dragging moves
 * the knob, and the resulting screen-space direction drives the local player
 * (mapped to world space by `JoystickMove`). Releasing hides it and stops.
 *
 * `active` / `ox` / `oy` (origin) change rarely (press / release) so they live in
 * React state to drive the visual. The knob offset (`kx` / `ky`) updates every
 * touchmove; it's small and only the joystick component subscribes, so the churn
 * is cheap. The scene reads the direction each frame via `getJoystickVector`.
 */
export const JOYSTICK_RADIUS = 56; // px — max knob travel from the origin
const DEADZONE = 0.18; // fraction of the radius ignored as drift

interface JoystickStore {
  active: boolean;
  /** Origin (touch-down point) in client px. */
  ox: number;
  oy: number;
  /** Knob offset from the origin in client px, clamped to JOYSTICK_RADIUS. */
  kx: number;
  ky: number;
  begin: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
}

export const useJoystickStore = create<JoystickStore>((set) => ({
  active: false,
  ox: 0,
  oy: 0,
  kx: 0,
  ky: 0,
  begin: (x, y) => set({ active: true, ox: x, oy: y, kx: 0, ky: 0 }),
  move: (x, y) =>
    set((s) => {
      let dx = x - s.ox;
      let dy = y - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > JOYSTICK_RADIUS) {
        dx = (dx / len) * JOYSTICK_RADIUS;
        dy = (dy / len) * JOYSTICK_RADIUS;
      }
      return { kx: dx, ky: dy };
    }),
  end: () => set({ active: false, kx: 0, ky: 0 }),
}));

/**
 * Current joystick direction in screen space: `dx` right-positive, `dy`
 * down-positive (client coords), already past the deadzone. `mag` is 0 when idle
 * or within the deadzone. Read each frame by the scene mover — no subscription.
 */
export function getJoystickVector(): { dx: number; dy: number; mag: number } {
  const { active, kx, ky } = useJoystickStore.getState();
  if (!active) return { dx: 0, dy: 0, mag: 0 };
  const len = Math.hypot(kx, ky);
  const mag = len / JOYSTICK_RADIUS;
  if (mag < DEADZONE) return { dx: 0, dy: 0, mag: 0 };
  return { dx: kx / len, dy: ky / len, mag: Math.min(1, mag) };
}
