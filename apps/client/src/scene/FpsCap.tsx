import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/** Target frame rate. The scene renders on demand (frameloop="demand"); this
 *  drives the renders, so it's a hard cap, not just a throttle. */
const TARGET_FPS = 45;

/**
 * Caps the render rate. With the Canvas in `frameloop="demand"` mode nothing
 * renders unless something requests it; this requests a frame at most
 * `TARGET_FPS` times a second, so every `useFrame` (movement prediction, camera,
 * animation) runs at that capped cadence. Far lighter on CPU/GPU than unbounded
 * 60fps, and the browser still pauses it entirely when the tab is hidden.
 */
export function FpsCap() {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const interval = 1000 / TARGET_FPS;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= interval) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);

  return null;
}
