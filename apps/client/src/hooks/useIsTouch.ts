import { useEffect, useState } from 'react';

/**
 * Whether this device is touch-first (phone / tablet) — used to swap in the
 * mobile control scheme (a floating movement joystick + tappable ability
 * buttons) for the desktop mouse/keyboard one.
 *
 * We treat "no fine pointer" as touch: a device that lacks a precise hover
 * pointer (`(pointer: coarse)` and not `(hover: hover)`) is the phone/tablet
 * case. This mirrors the hover-tooltip gate already used elsewhere.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  return coarse || noHover;
}

/** React hook form of {@link isTouchDevice}, re-evaluated if the media query flips. */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(isTouchDevice);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setTouch(isTouchDevice());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return touch;
}
