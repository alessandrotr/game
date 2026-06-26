import { cn } from '@/lib/utils';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSidebarStore } from './useSidebarStore';
import { SIDEBAR_ENTRIES, type SidebarEntry } from './sections';
import { RailIdentity } from './RailIdentity';

/** A single rail icon with a hover label flyout and an active highlight. */
function RailButton({
  entry,
  active,
  onSelect,
}: {
  entry: SidebarEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={entry.label}
      aria-pressed={entry.kind === 'panel' ? active : undefined}
      className={cn(
        'group relative grid size-11 place-items-center rounded-xl outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-gold/80',
        active
          ? 'bg-gold/15 text-gold ring-1 ring-gold/30'
          : 'text-muted hover:bg-white/5 hover:text-text',
      )}
    >
      <Icon size={20} aria-hidden="true" />
      {/* Hover label — flies out to the left, toward the screen interior. */}
      <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md border border-white/10 bg-panel/95 px-2 py-1 text-xs text-text opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100">
        {entry.label}
      </span>
    </button>
  );
}

/**
 * The always-visible town sidebar rail — a slim vertical strip of icons hugging
 * the right edge. Panel entries toggle their content panel; action entries run a
 * one-shot command. Account actions sit in a footer group below a divider.
 */
export function SidebarRail() {
  const active = useSidebarStore((s) => s.active);
  const toggle = useSidebarStore((s) => s.toggle);
  const guest = useAuthStore((s) => s.guest);

  const select = (entry: SidebarEntry) => () => {
    if (entry.kind === 'panel') toggle(entry.id);
    else entry.run();
  };

  const visible = SIDEBAR_ENTRIES.filter((e) => !e.guestOnly || guest);
  const main = visible.filter((e) => !e.footer);
  const footer = visible.filter((e) => e.footer);

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-panel/55 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
      <RailIdentity />
      <div className="my-0.5 h-px w-7 bg-white/10" />
      {main.map((e) => (
        <RailButton
          key={e.id}
          entry={e}
          active={e.kind === 'panel' && active === e.id}
          onSelect={select(e)}
        />
      ))}
      {footer.length > 0 && <div className="my-0.5 h-px w-7 bg-white/10" />}
      {footer.map((e) => (
        <RailButton
          key={e.id}
          entry={e}
          active={e.kind === 'panel' && active === e.id}
          onSelect={select(e)}
        />
      ))}
    </div>
  );
}
