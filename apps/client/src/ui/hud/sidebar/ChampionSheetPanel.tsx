import { CharacterSheet } from '../../CharacterSheet';
import { useSidebarStore } from './useSidebarStore';

/**
 * Host for the player's own character sheet — opened from the champion portrait at
 * the top of the rail (`champion` section). Renders like the other sidebar panels:
 * a single surface anchored beside the rail, with no town backdrop blur and no
 * free-standing 3D champion (the sheet is just the info panel).
 */
export function ChampionSheetPanel() {
  const open = useSidebarStore((s) => s.active === 'champion');
  const close = useSidebarStore((s) => s.close);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Champion"
      className="pointer-events-auto absolute right-24 top-1/2 -translate-y-1/2"
    >
      <CharacterSheet onClose={close} />
    </div>
  );
}
