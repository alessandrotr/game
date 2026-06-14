import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { getClassDefinition, getCosmeticOfType, xpProgress } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useHudStore } from '../store/useHudStore';
import { useCustomizeStore } from '../store/useCustomizeStore';
import { ClassPreview } from './ClassPreview';
import { Button, Card, IconButton, LevelBadge, Meter, StatTile } from './primitives';
import { STAT_COLORS, accentHeaderStyle } from './theme';

/** A compact labelled bar (HP / MP / XP) — the player card's tuning of `Meter`. */
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <Meter
      value={value}
      max={max}
      fill={color}
      label={label}
      valueText={Math.round(value)}
      labelClassName="w-6 text-[10px] font-semibold"
      valueClassName="w-9 text-[11px]"
      trackClassName="bg-black/45"
      fillClassName="transition-[width] duration-150"
    />
  );
}


/**
 * The local player's info HUD (town only) — styled like the player paperdoll: a
 * 3D portrait of your champion plus level, XP, and career stats. A toggle (▾/▸,
 * persisted via the HUD store) collapses it to a slim identity bar. In the arena
 * this is replaced by the unified `CombatHud`, which carries portrait + HP/MP.
 */
export function PlayerCard() {
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // re-render ~20×/s so stats track the server
  const compact = useHudStore((s) => s.playerCardCompact);
  const setCompact = useHudStore((s) => s.setPlayerCardCompact);
  const showCustomize = useCustomizeStore((s) => s.show);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const def = getClassDefinition(me.characterClass);
  const { span, into } = xpProgress(me.level, me.xp);
  const title = me.titleId ? getCosmeticOfType(me.titleId, 'title')?.text : undefined;
  const pedestalColor = me.pedestalId ? getCosmeticOfType(me.pedestalId, 'pedestal')?.color : undefined;
  const kd = me.deaths > 0 ? (me.kills / me.deaths).toFixed(2) : me.kills.toFixed(2);

  const ToggleButton = (
    <IconButton
      icon={compact ? ChevronRight : ChevronDown}
      onClick={() => setCompact(!compact)}
      aria-label={compact ? 'Expand' : 'Collapse'}
      title={compact ? 'Expand' : 'Collapse'}
      className="pointer-events-auto ml-auto"
    />
  );

  // --- Compact: a slim identity bar with the XP track ---
  if (compact) {
    return (
      <Card variant="hud" className="pointer-events-none w-64">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <LevelBadge level={me.level} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-display text-[14px] tracking-wide text-white">{me.name}</div>
            <div className="truncate text-[10px]" style={{ color: def.color }}>
              {def.name}
            </div>
          </div>
          {ToggleButton}
        </div>
        <div className="px-3 pb-2.5">
          <Bar label="XP" value={into} max={span} color={def.color} />
        </div>
      </Card>
    );
  }

  // --- Expanded: paperdoll-style with a 3D portrait + career stats ---
  return (
    <Card variant="hud" className="pointer-events-none w-64 bg-panel/90">
      <div className="flex items-center gap-3 px-3 py-2.5" style={accentHeaderStyle(def.color)}>
        <LevelBadge level={me.level} size="md" />
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] tracking-wide text-white">{me.name}</div>
          <div className="truncate text-[11px]" style={{ color: def.color }}>
            {def.name} · {def.role}
          </div>
          {title && (
            <div className="truncate text-[10px] uppercase tracking-wider text-gold/80">{title}</div>
          )}
        </div>
        {ToggleButton}
      </div>

      {/* 3D portrait (lite, auto-rotating) — shows the equipped look. */}
      <div className="h-44 border-y border-white/5 bg-black/40">
        <ClassPreview
          characterClass={me.characterClass}
          skinId={me.skinId}
          dyeId={me.dyeId}
          pedestalColor={pedestalColor}
          lite
        />
      </div>

      <div className="px-3 pb-3 pt-2">
        <Meter
          layout="stacked"
          size="md"
          value={into}
          max={span}
          fill={`linear-gradient(90deg, ${def.color}, ${STAT_COLORS.xpTip})`}
          label="XP"
          valueText={`${Math.round(into)} / ${span}`}
          headerClassName="mb-1 items-baseline"
          labelClassName="text-[10px] uppercase tracking-wide text-muted"
          valueClassName="text-[10px] text-white/60"
          trackClassName="bg-black/45"
          fillClassName="transition-[width] duration-300"
        />

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <StatTile label="Kills" value={me.kills} color={STAT_COLORS.positive} />
          <StatTile label="Deaths" value={me.deaths} color={STAT_COLORS.negative} />
          <StatTile label="K/D" value={kd} color={STAT_COLORS.text} />
        </div>

        <Button
          variant="goldOutline"
          size="sm"
          onClick={() => showCustomize('profile')}
          className="pointer-events-auto mt-3 w-full gap-1.5"
        >
          <Sparkles size={13} /> Customize
        </Button>
      </div>
    </Card>
  );
}
