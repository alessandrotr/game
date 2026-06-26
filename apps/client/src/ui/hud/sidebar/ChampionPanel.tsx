import { useEffect, useState } from 'react';
import { Palette, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '../../primitives';
import { ChampionContent } from '../../CustomizePanel';
import { useCustomizeStore } from '../../../store/useCustomizeStore';
import { useSidebarStore } from './useSidebarStore';

/**
 * The customization hub panel — Champion (equip) and Store (browse) views share
 * this one container. Unlike the simple sidebar sections it stays MOUNTED once
 * first opened (toggling visibility, never unmounting) so the showcase + the
 * shared WebGL thumbnail contexts — especially the R3F `EmoteThumbStage` — aren't
 * torn down and recreated when collapsing or switching between the two views.
 */
export function ChampionPanel() {
  const active = useSidebarStore((s) => s.active);
  const close = useSidebarStore((s) => s.close);
  const openPaint = useCustomizeStore((s) => s.openPaint);
  const setPreview = useCustomizeStore((s) => s.setPreview);

  const isHub = active === 'champion' || active === 'store';
  const view: 'customize' | 'store' = active === 'store' ? 'store' : 'customize';

  // Lazy-mount on first open (no WebGL contexts spun up just by entering town),
  // then keep mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (isHub) setMounted(true);
  }, [isHub]);

  // Drop any try-on preview when leaving the hub entirely.
  useEffect(() => {
    if (!isHub) setPreview(null);
  }, [isHub, setPreview]);

  if (!mounted) return null;

  const title = view === 'store' ? 'Store' : 'Champion';

  return (
    <div
      role="dialog"
      aria-label={title}
      aria-hidden={!isHub}
      className={cn(
        'absolute right-24 top-1/2 flex max-h-[88vh] w-[min(64rem,calc(100vw-10rem))] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/95 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-md transition-[opacity,transform] duration-300 ease-out',
        isHub
          ? 'pointer-events-auto translate-x-0 opacity-100'
          : 'pointer-events-none invisible translate-x-3 opacity-0',
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide text-gold">
          <Sparkles size={18} aria-hidden /> {title}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button variant="panel" size="sm" onClick={openPaint} className="gap-1.5">
            <Palette size={14} aria-hidden /> Paint
          </Button>
          <IconButton icon={X} aria-label="Close" onClick={close} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChampionContent view={view} />
      </div>
    </div>
  );
}
