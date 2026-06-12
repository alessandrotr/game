import { create } from 'zustand';

/**
 * Live render metrics, sampled inside the R3F loop by `PerfMeter` (~2×/s to keep
 * the DOM overlay cheap) and displayed by `PerfOverlay`. Pure numbers — no Three
 * objects — so any DOM component can read them.
 */
interface PerfStore {
  fps: number;
  /** Mean frame time over the sample window, ms. */
  ms: number;
  /** Draw calls in the last frame. */
  calls: number;
  /** Triangles in the last frame. */
  tris: number;
  update: (fps: number, ms: number, calls: number, tris: number) => void;
}

export const usePerfStore = create<PerfStore>((set) => ({
  fps: 0,
  ms: 0,
  calls: 0,
  tris: 0,
  update: (fps, ms, calls, tris) =>
    set({ fps: Math.round(fps), ms: Math.round(ms * 10) / 10, calls, tris }),
}));
