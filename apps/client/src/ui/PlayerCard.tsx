import {
  claimableCount,
  classCosmeticsOf,
  getClassDefinition,
  getCosmeticOfType,
  xpProgress,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { useCustomizeStore } from '../store/useCustomizeStore';
import { ClassPreview } from './ClassPreview';
import { Card, Meter } from './primitives';
import { STAT_COLORS } from './theme';

/**
 * The local player's identity HUD (town only): level badge, name, class, and
 * title, with an XP track underneath — the same identity block shown in the
 * customization panel's showcase. Clicking it opens that panel. In the arena
 * this is replaced by the unified `CombatHud`.
 */
export function PlayerCard() {
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // re-render ~20×/s so XP tracks the server
  const showCustomize = useCustomizeStore((s) => s.show);
  const byClass = useCosmeticsStore((s) => s.byClass);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const def = getClassDefinition(me.characterClass);
  const { span, into } = xpProgress(me.level, me.xp);
  const title = me.titleId ? getCosmeticOfType(me.titleId, 'title') : undefined;
  // Items reachable at this level but not yet claimed → a "go to the store" nudge.
  const owned = classCosmeticsOf(byClass, me.characterClass).owned;
  const claimable = claimableCount(owned, me.characterClass, me.level);

  // With items to claim, drop the user straight into the store; otherwise the
  // customize tab. Either way it's the same panel.
  const open = () => showCustomize(claimable > 0 ? 'store' : 'customize');

  return (
    <Card
      variant="hud"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      title={claimable > 0 ? `${claimable} to unlock in the store` : 'Customize'}
      className="pointer-events-auto relative w-64 cursor-pointer overflow-visible transition hover:ring-1 hover:ring-gold/40"
    >
      {claimable > 0 && (
        <span
          className="absolute -right-2 -top-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-black shadow-lg ring-2 ring-panel"
          aria-label={`${claimable} items to unlock`}
        >
          {claimable}
        </span>
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Circular auto-rotating champion portrait with a level disc on its
            lower edge — the same identity token as the combat HUD ability panel. */}
        <div className="relative h-14 w-14 shrink-0">
          <div className="h-full w-full overflow-hidden rounded-full border-2 border-gold/70 bg-black/50 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            <ClassPreview characterClass={me.characterClass} lite spin={false} />
          </div>
          <div className="absolute -bottom-1 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-gold/70 bg-linear-to-b from-panel to-bg shadow-md">
            <span className="font-display text-[11px] font-bold leading-none text-gold tabular-nums">
              {me.level}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          {title && (
            <div
              className="truncate text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: title.color, textShadow: `0 0 8px ${title.color}66` }}
            >
              {title.text}
            </div>
          )}
          <div className="truncate font-display text-[15px] tracking-wide text-white">{me.name}</div>
          <div className="truncate text-[11px]" style={{ color: def.color }}>
            {def.name} · {def.role}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Meter
          layout="stacked"
          size="md"
          value={into}
          max={span}
          fill={`linear-gradient(90deg, ${def.color}, ${STAT_COLORS.xpTip})`}
          label="XP"
          valueText={`${Math.round(into)} / ${span}`}
          labelClassName="text-[10px] uppercase tracking-wide text-white/70"
          valueClassName="text-[10px] text-white/60"
          trackClassName="bg-white/15 ring-1 ring-inset ring-white/10"
          className="flex flex-col gap-1"
        />
      </div>
    </Card>
  );
}
