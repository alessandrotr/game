import { cn } from '@/lib/utils';
import { CharacterSheet } from '../../CharacterSheet';
import { useSidebarStore } from './useSidebarStore';

/**
 * Host for the player's own character sheet ("paperdoll") — opened from the
 * champion portrait at the top of the rail (`champion` section). Mirrors the store
 * hub: a borderless positioning container + a dim/blur backdrop, with the
 * free-standing champion on the left and the single info panel on the right (the
 * sheet itself owns that surface). Mount/unmount on open/close is fine — it carries
 * one portrait canvas, like the town inspect paperdoll.
 */
export function ChampionSheetPanel() {
  const open = useSidebarStore((s) => s.active === 'champion');
  const close = useSidebarStore((s) => s.close);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — dims + blurs the town so the sheet reads as a focused surface. */}
      <div aria-hidden onClick={close} className="fixed inset-0 bg-black/45 backdrop-blur-md" />
      <div
        role="dialog"
        aria-label="Champion"
        className={cn(
          'pointer-events-auto absolute right-24 top-1/2 flex -translate-y-1/2 items-end gap-8',
        )}
      >
        <CharacterSheet onClose={close} />
      </div>
    </>
  );
}
