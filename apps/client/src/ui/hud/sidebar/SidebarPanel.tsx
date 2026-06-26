import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '../../primitives';
import { useSidebarStore } from './useSidebarStore';
import { panelEntry, type PanelWidth } from './sections';

const WIDTH_CLASS: Record<PanelWidth, string> = {
  narrow: 'w-[min(26rem,calc(100vw-10rem))]',
  medium: 'w-[min(36rem,calc(100vw-10rem))]',
  wide: 'w-[min(64rem,calc(100vw-10rem))]',
};

/**
 * The content panel that slides out beside the rail for the active section.
 *
 * Anchored to the left of the rail and absolutely positioned, so expanding it
 * never shifts the rail. The last-shown section is retained through the collapse
 * animation (`shown`) so content doesn't blink away before the slide finishes.
 */
export function SidebarPanel() {
  const active = useSidebarStore((s) => s.active);
  const close = useSidebarStore((s) => s.close);

  const [shown, setShown] = useState(active);
  useEffect(() => {
    if (active) setShown(active);
  }, [active]);

  // Hub sections (Champion / Store) render in the always-mounted ChampionPanel,
  // not here — skip them so the two panels never both show.
  const entry = shown ? panelEntry(shown) : undefined;
  const Content = entry && !entry.hub ? entry.Content : undefined;
  const open = active !== null && Content !== undefined;

  return (
    <div
      role="dialog"
      aria-label={entry?.label}
      aria-hidden={!open}
      onTransitionEnd={() => {
        if (active === null) setShown(null);
      }}
      className={cn(
        'absolute right-24 top-1/2 flex max-h-[88vh] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/95 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-md transition-[opacity,transform] duration-300 ease-out',
        entry ? WIDTH_CLASS[entry.width] : WIDTH_CLASS.narrow,
        open
          ? 'pointer-events-auto translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-3 opacity-0',
      )}
    >
      {entry && Content && (
        <>
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-display text-lg font-bold tracking-wide text-gold">
              {entry.label}
            </h2>
            <IconButton icon={X} aria-label="Close" onClick={close} />
          </div>
          {/* Sections own their own scroll/layout (simple lists scroll; the
              leaderboard pins its tabs and scrolls its rows). */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Content />
          </div>
        </>
      )}
    </div>
  );
}
