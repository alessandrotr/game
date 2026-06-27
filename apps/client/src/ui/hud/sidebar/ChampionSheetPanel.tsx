import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CharacterSheet } from '../../CharacterSheet';
import { useSidebarStore } from './useSidebarStore';
import { PANEL_SURFACE, SidebarHeader } from './panelChrome';

/**
 * Host for the player's own character sheet ("paperdoll") — opened from the
 * champion portrait at the top of the rail (`champion` section). A read-only
 * overview of the current champion with a jump into the wardrobe; unlike the
 * wardrobe hub it carries a single portrait canvas, so plain mount/unmount on
 * open/close is fine (like the town inspect paperdoll). Shares the sidebar's
 * frosted surface + crest header.
 */
export function ChampionSheetPanel() {
  const open = useSidebarStore((s) => s.active === 'champion');
  const close = useSidebarStore((s) => s.close);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — dims + blurs the town so the sheet reads as a focused surface. */}
      <div
        aria-hidden
        onClick={close}
        className="fixed inset-0 bg-black/45 backdrop-blur-md"
      />
      <div
        role="dialog"
        aria-label="Champion"
        style={{ containerType: 'inline-size' }}
        className={cn(
          PANEL_SURFACE,
          'pointer-events-auto absolute right-24 top-1/2 h-[80vh] w-[min(58rem,calc(100vw-10rem))] -translate-y-1/2',
        )}
      >
        <SidebarHeader icon={UserRound} title="Champion" onClose={close} />
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <CharacterSheet />
        </div>
      </div>
    </>
  );
}
