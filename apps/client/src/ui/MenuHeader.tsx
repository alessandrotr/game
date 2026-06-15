import { AudioControl } from './AudioControl';

/**
 * The shared top bar for the pre-game menus (auth + character select): the ARENA
 * wordmark on the left, audio controls on the right. Identical on both screens
 * so the transition between them is seamless. Account controls live elsewhere
 * (centered above the class picker once signed in), not in this bar.
 */
export function MenuHeader() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4 sm:p-5">
      <div className="pointer-events-auto">
        <h1 className="font-display text-2xl tracking-[0.35em] indent-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.4)] sm:text-3xl">
          ARENA
        </h1>
      </div>
      <div className="pointer-events-auto">
        <AudioControl />
      </div>
    </div>
  );
}
