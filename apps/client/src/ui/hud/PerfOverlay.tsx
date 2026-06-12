import { usePerfStore } from '../../store/usePerfStore';
import { useHudStore } from '../../store/useHudStore';
import { useGameStore } from '../../store/useGameStore';

/** Compact triangle count, e.g. 12.3k / 1.2M. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Tiny top-right performance readout: FPS + frame time (colour-coded), draw
 * calls + triangles, and the live entity count. Fed by {@link usePerfStore};
 * toggled by the "Show performance stats" setting. Non-interactive overlay.
 */
export function PerfOverlay() {
  const show = useHudStore((s) => s.showPerf);
  const fps = usePerfStore((s) => s.fps);
  const ms = usePerfStore((s) => s.ms);
  const calls = usePerfStore((s) => s.calls);
  const tris = usePerfStore((s) => s.tris);
  const players = useGameStore((s) => s.playerIds.length);

  if (!show) return null;

  const fpsColor = fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#ff6b6b';

  return (
    <div className="pointer-events-none fixed right-2 top-2 z-[100] rounded-md bg-black/55 px-2 py-1 text-right font-mono text-[11px] leading-tight text-white/80 backdrop-blur-sm">
      <div style={{ color: fpsColor }}>
        {fps} fps · {ms} ms
      </div>
      <div>
        {calls} draws · {compact(tris)} tris
      </div>
      <div>{players} players</div>
    </div>
  );
}
