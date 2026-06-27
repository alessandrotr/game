import { claimableCount, classCosmeticsOf } from '@arena/shared';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../../../store/useAuthStore';
import { useGameStore } from '../../../store/useGameStore';
import { useCosmeticsStore } from '../../../store/useCosmeticsStore';
import { useSidebarStore } from './useSidebarStore';
import { SIDEBAR_ENTRIES, type SidebarEntry } from './sections';
import { RailIdentity } from './RailIdentity';

/** A single rail icon with a hover label flyout and an active highlight. An
 *  optional `badge` count surfaces a notification (e.g. claimable cosmetics). */
function RailButton({
  entry,
  active,
  badge = 0,
  onSelect,
}: {
  entry: SidebarEntry;
  active: boolean;
  badge?: number;
  onSelect: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={badge > 0 ? `${entry.label} — ${badge} to unlock` : entry.label}
      aria-pressed={entry.kind === 'panel' ? active : undefined}
      className={cn(
        'group relative grid size-11 place-items-center rounded-xl outline-none transition duration-200',
        'focus-visible:ring-2 focus-visible:ring-gold/80',
        active
          ? 'bg-gold/15 text-gold ring-1 ring-gold/30'
          : entry.accent
            ? // The upgrade CTA — a soft gold-gradient chip that brightens on hover,
              // so it reads as special without shouting. No resting glow.
              'bg-linear-to-b from-gold/25 to-gold/5 text-gold ring-1 ring-gold/25 hover:from-gold/35 hover:to-gold/10'
            : 'text-muted hover:bg-white/5 hover:text-text',
      )}
    >
      <Icon size={20} aria-hidden="true" />
      {badge > 0 && (
        <span
          className="absolute -right-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-black shadow-lg ring-1 ring-panel/50 brightness-125"
          aria-hidden="true"
        >
          {badge}
        </span>
      )}
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
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // re-check claimables as level / XP track the server
  const byClass = useCosmeticsStore((s) => s.byClass);

  // Cosmetics the current champion can claim now — surfaced as a badge on the Store.
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const claimable = me
    ? claimableCount(classCosmeticsOf(byClass, me.characterClass).owned, me.characterClass, me.level)
    : 0;

  const select = (entry: SidebarEntry) => () => {
    if (entry.kind === 'panel') toggle(entry.id);
    else entry.run();
  };

  const badgeFor = (entry: SidebarEntry): number => (entry.id === 'store' ? claimable : 0);

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
          badge={badgeFor(e)}
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
