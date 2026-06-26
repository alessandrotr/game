import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from './useSidebarStore';
import { panelEntry, type PanelWidth } from './sections';
import { PANEL_SURFACE, SidebarHeader } from './panelChrome';

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
 * Wears the shared "Trial of Blades" surface + crest header (see panelChrome).
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
      style={{ containerType: 'inline-size' }}
      onTransitionEnd={() => {
        if (active === null) setShown(null);
      }}
      className={cn(
        PANEL_SURFACE,
        'absolute right-24 top-1/2 max-h-[88vh] -translate-y-1/2 transition-[opacity,transform] duration-300 ease-out',
        entry ? WIDTH_CLASS[entry.width] : WIDTH_CLASS.narrow,
        open
          ? 'pointer-events-auto translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-3 opacity-0',
      )}
    >
      {entry && Content && (
        <>
          <SidebarHeader icon={entry.icon} title={entry.label} onClose={close} />
          {/* Sections own their own scroll/layout (simple lists scroll; the
              leaderboard pins its tabs and scrolls its rows). */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
            <Content />
          </div>
        </>
      )}
    </div>
  );
}
