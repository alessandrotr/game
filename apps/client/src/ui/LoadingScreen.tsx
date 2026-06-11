import { ScreenHeader } from './ScreenHeader';

/**
 * Brief branded intro shown on boot (while a saved session restores, and for a
 * minimum window so it reads as deliberate) and during a world swap. Pure DOM —
 * no WebGL canvas — so it covers the scene while a room is joined.
 */
export function LoadingScreen({ subtitle = 'Loading the arena…' }: { subtitle?: string }) {
  return (
    <div className="absolute inset-0 z-60 flex flex-col items-center justify-center gap-7 bg-arena-radial">
      <ScreenHeader subtitle={subtitle} titleClassName="text-5xl" />
      <div className="h-1 w-48 overflow-hidden rounded-full bg-black/50">
        <div className="h-full w-1/3 rounded-full bg-linear-to-r from-transparent via-gold to-transparent animate-[loadsweep_1.1s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
