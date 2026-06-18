import { useProgress } from '@react-three/drei';
import { cn } from '@/lib/utils';

/**
 * Progress feedback while 3D assets download. Reads drei's GLOBAL load state (it
 * subscribes to the shared loading manager, so it works OUTSIDE any `<Canvas>`
 * and reflects every in-flight GLTF/texture). Renders nothing once loading
 * settles. Drop it as an overlay (`absolute inset-0`) over the area whose models
 * are still loading.
 */
export function AssetLoadingBar({
  className,
  label = 'Loading…',
}: {
  className?: string;
  label?: string;
}) {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div
      className={cn(
        // Transparent backdrop: the loading bar floats over the live 3D portrait
        // (no opaque panel/blur covering it). A soft drop-shadow keeps the text
        // and bar legible against the model behind them.
        'pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="font-display text-base tracking-[0.3em] text-gold/90 tabular-nums">
        {Math.round(progress)}%
      </span>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full rounded-full bg-linear-to-r from-gold-dark to-gold transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] uppercase tracking-[0.25em] text-muted">{label}</span>
    </div>
  );
}
