import { useEffect } from 'react';
import { isTouchDevice } from '../../hooks/useIsTouch';
import { useJoystickStore, JOYSTICK_RADIUS } from '../../store/joystickState';
import { useFocusStore } from '../../store/useFocusStore';

/**
 * Floating mobile movement joystick — the standard mobile-game control. A touch
 * that lands on the game world (the WebGL canvas) spawns the joystick wherever
 * the finger goes down; dragging steers, releasing hides it. Touches that land
 * on HUD chrome (ability buttons, menus) have a non-canvas target and are left
 * alone, so those controls keep working.
 *
 * Touch listeners live on `window` (so the drag isn't lost if the finger slides
 * off the canvas), but a press only arms the stick when its target is the
 * canvas. `JoystickMove` reads the resulting direction each frame to move the
 * player. Inert on non-touch devices (never mounted).
 */
export function MobileJoystick() {
  const active = useJoystickStore((s) => s.active);
  const ox = useJoystickStore((s) => s.ox);
  const oy = useJoystickStore((s) => s.oy);
  const kx = useJoystickStore((s) => s.kx);
  const ky = useJoystickStore((s) => s.ky);

  useEffect(() => {
    const store = useJoystickStore.getState();
    let touchId: number | null = null;

    const isCanvas = (el: EventTarget | null) => el instanceof HTMLCanvasElement;

    const onStart = (e: TouchEvent) => {
      if (touchId !== null) return; // already steering with another finger
      // Movement is locked while a structure is cinematically focused.
      if (useFocusStore.getState().target) return;
      // Twin-zone controls: the left half of the screen drives the move stick,
      // the right half is the camera look-drag (see CameraControls). Only claim
      // a left-half touch that lands on the game world (not HUD chrome).
      const t = Array.from(e.changedTouches).find(
        (tt) => isCanvas(tt.target) && tt.clientX < window.innerWidth * 0.5,
      );
      if (!t) return;
      touchId = t.identifier;
      useJoystickStore.getState().begin(t.clientX, t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      if (touchId === null) return;
      const t = Array.from(e.changedTouches).find((tt) => tt.identifier === touchId);
      if (!t) return;
      useJoystickStore.getState().move(t.clientX, t.clientY);
    };
    const onEnd = (e: TouchEvent) => {
      if (touchId === null) return;
      const ended = Array.from(e.changedTouches).some((tt) => tt.identifier === touchId);
      if (!ended) return;
      touchId = null;
      useJoystickStore.getState().end();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      store.end();
    };
  }, []);

  if (!active) return null;

  const base = JOYSTICK_RADIUS;
  return (
    <div className="pointer-events-none fixed inset-0 z-hud" aria-hidden="true">
      {/* Outer ring at the touch origin. */}
      <div
        className="absolute rounded-full border-2 border-white/40 bg-white/5 backdrop-blur-sm"
        style={{
          left: ox - base,
          top: oy - base,
          width: base * 2,
          height: base * 2,
          boxShadow: '0 0 18px rgba(0,0,0,0.35)',
        }}
      />
      {/* Knob, offset by the drag. */}
      <div
        className="absolute rounded-full bg-white/80 shadow-lg"
        style={{
          left: ox + kx - base * 0.5,
          top: oy + ky - base * 0.5,
          width: base,
          height: base,
        }}
      />
    </div>
  );
}

/** Mount the joystick only on touch devices (avoids the listeners on desktop). */
export function MobileJoystickGate() {
  if (!isTouchDevice()) return null;
  return <MobileJoystick />;
}
