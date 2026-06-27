import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChampionContent } from '../../CustomizePanel';
import { useCustomizeStore } from '../../../store/useCustomizeStore';
import { useSidebarStore } from './useSidebarStore';

/**
 * The unified Store / wardrobe. The champion stands free to the left (over the
 * world) beside its own floating item case on the right — the tabs are the case's
 * header, so there's no separate crest bar. Stays MOUNTED once first opened
 * (toggling visibility, never unmounting) so the showcase + the shared WebGL
 * thumbnail contexts — especially the R3F `EmoteThumbStage` — aren't torn down and
 * recreated when collapsing. Opened from the Store rail icon or the character
 * sheet's "Customize" button (both route to the `store` section).
 */
export function ChampionPanel() {
  const active = useSidebarStore((s) => s.active);
  const close = useSidebarStore((s) => s.close);
  const setPreview = useCustomizeStore((s) => s.setPreview);

  const isHub = active === 'store';

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

  return (
    <>
      {/* Backdrop — dims + blurs the town so the case reads as a focused surface.
          Clicking it closes the hub. */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          'fixed inset-0 bg-black/45 backdrop-blur-md transition-opacity duration-300',
          isHub ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        role="dialog"
        aria-label="Store"
        aria-hidden={!isHub}
        className={cn(
          'absolute right-24 top-1/2 flex -translate-y-1/2 items-end gap-8 transition-[opacity,transform] duration-300 ease-out',
          isHub
            ? 'pointer-events-auto translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-3 opacity-0',
        )}
      >
        <ChampionContent onClose={close} />
      </div>
    </>
  );
}
