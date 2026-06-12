import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePerfStore } from '../store/usePerfStore';

/** Sample window (seconds) — average over this before publishing, so the readout
 *  is stable and the DOM overlay only updates a couple of times a second. */
const WINDOW = 0.5;

/**
 * Samples render metrics from the R3F loop (FPS, mean frame time, and the
 * renderer's draw-call / triangle counts) and publishes them to {@link
 * usePerfStore}. Lives inside the Canvas; the DOM overlay reads the store.
 */
export function PerfMeter() {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const acc = useRef(0);

  useFrame((_, delta) => {
    frames.current += 1;
    acc.current += delta;
    if (acc.current >= WINDOW) {
      const fps = frames.current / acc.current;
      const ms = (acc.current / frames.current) * 1000;
      const r = gl.info.render; // last-frame counts (info auto-resets each frame)
      usePerfStore.getState().update(fps, ms, r.calls, r.triangles);
      frames.current = 0;
      acc.current = 0;
    }
  });

  return null;
}
