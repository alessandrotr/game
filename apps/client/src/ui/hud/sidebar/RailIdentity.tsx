import { getClassDefinition, getCosmeticOfType, xpProgress } from '@arena/shared';
import { cn } from '@/lib/utils';
import { useGameStore } from '../../../store/useGameStore';
import { ClassPreview } from '../../ClassPreview';
import { AvatarFrame } from '../../AvatarFrame';
import { rimColorOf } from '../../rim';
import { useSidebarStore } from './useSidebarStore';

/**
 * The sidebar's crown: the player's live champion portrait + level, parked at the
 * top of the rail. Absorbs the old top-left PlayerCard — clicking it opens the
 * Champion hub (or the Store when there are items to claim). An auto-rotating
 * portrait in a glowing rim frame with a level gem and a name/class/XP flyout on
 * hover. (Claimable-cosmetic notifications live on the Store rail entry, not here.)
 */
export function RailIdentity() {
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // re-render ~20×/s so level / XP track the server
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const active = useSidebarStore((s) => s.active === 'champion');

  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const def = getClassDefinition(me.characterClass);
  const { span, into } = xpProgress(me.level, me.xp);
  const title = me.titleId ? getCosmeticOfType(me.titleId, 'title') : undefined;
  const rimColor = rimColorOf(me.rimId);

  // The portrait toggles the player's own character sheet — click to open, click
  // again (while open) to close, like the other rail buttons.
  const open = () => toggleSidebar('champion');

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Champion — ${me.name}, level ${me.level}`}
      aria-pressed={active}
      title="Champion"
      className={cn(
        'group relative flex flex-col items-center rounded-xl p-1 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-gold/80',
        active ? 'bg-gold/10 ring-1 ring-gold/30' : 'hover:bg-white/5',
      )}
    >
      <div className="relative h-14 w-14">
        <AvatarFrame rimId={me.rimId} size="sm" className="h-full w-full">
          <ClassPreview
            characterClass={me.characterClass}
            skinId={me.skinId}
            dyeId={me.dyeId}
            pedestalId={me.pedestalId}
            lite
            spin={false}
          />
        </AvatarFrame>
        {/* Level gem on the lower edge, tinted to the rim. */}
        <div
          className="absolute -bottom-1 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border bg-linear-to-b from-panel to-bg shadow-md"
          style={{ borderColor: `${rimColor}b3`, boxShadow: `0 0 8px ${rimColor}59` }}
        >
          <span
            className="font-display text-[11px] font-bold leading-none tabular-nums"
            style={{ color: rimColor }}
          >
            {me.level}
          </span>
        </div>
      </div>

      {/* Name / class / title + XP — a flyout to the left, on hover/focus. */}
      <span className="pointer-events-none absolute right-full top-1/2 mr-2 w-48 -translate-y-1/2 rounded-xl border border-white/10 bg-panel/95 p-3 text-left opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {title && (
          <span
            className="block truncate text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: title.color, textShadow: `0 0 8px ${title.color}66` }}
          >
            {title.text}
          </span>
        )}
        <span className="block truncate text-sm font-semibold tracking-wide text-white">
          {me.name}
        </span>
        <span className="block truncate text-[11px] text-muted">{def.name}</span>
        {/* XP — labelled bar with the into/span text, mirroring the Store sheet. */}
        <span className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
          <span>XP</span>
          <span className="tabular-nums text-text/80">
            {Math.round(into)} / {span}
          </span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${span > 0 ? Math.min(100, (into / span) * 100) : 0}%`,
              background: `linear-gradient(90deg, var(--color-gold-dark), var(--color-gold))`,
            }}
          />
        </span>
      </span>
    </button>
  );
}
