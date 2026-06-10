import { useEffect, useRef } from 'react';

/** Live keyboard state for the controller. Mutated in place — never causes re-renders. */
export interface ControlsState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  /** Set on jump keydown, cleared by the controller once a jump is applied. */
  jump: boolean;
}

const KEY_MAP: Record<string, keyof ControlsState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
};

/**
 * Tracks WASD/arrows, Shift (sprint) and Space (jump) and returns a stable,
 * mutable {@link ControlsState} object read each frame by the controller.
 * Returning a ref object (not React state) keeps input out of the render loop.
 */
export function useKeyboardControls(): React.MutableRefObject<ControlsState> {
  const controls = useRef<ControlsState>({
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
  });

  useEffect(() => {
    const setKey = (code: string, pressed: boolean) => {
      const action = KEY_MAP[code];
      if (!action) return;
      controls.current[action] = pressed;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault(); // stop page scroll
      if (e.repeat) return;
      setKey(e.code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => setKey(e.code, false);
    const onBlur = () => {
      const c = controls.current;
      c.forward = c.back = c.left = c.right = c.sprint = c.jump = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return controls;
}
