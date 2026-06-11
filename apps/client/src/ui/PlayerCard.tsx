import { ChevronDown, ChevronRight } from 'lucide-react';
import { getClassDefinition, xpProgress } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { usePersistentToggle } from '../hooks/usePersistentToggle';
import { ClassPreview } from './ClassPreview';
import { Card, IconButton, Meter, StatTile } from './primitives';
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

/** Square level badge in the class colour. */
function LevelBadge({ level, color, size }: { level: number; color: string; size: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  return (
    <div
      className={`flex ${box} shrink-0 flex-col items-center justify-center rounded-xl border`}
      style={{ borderColor: color, background: `${color}1f`, boxShadow: `0 0 14px ${color}55` }}
    >
      <span className="text-[8px] font-semibold uppercase tracking-wider text-white/60">Lvl</span>
      <span className={`${size === 'lg' ? 'text-lg' : 'text-sm'} font-bold leading-none`} style={{ color }}>
        {level}
      </span>
    </div>
  );
}

/**
 * The local player's info HUD — styled like the player paperdoll: a 3D portrait
 * of your champion plus level/XP and career stats (and HP/MP in the arena). A
 * toggle (▾/▸, persisted) collapses it to a slim bar showing only the essentials.
 */
export function PlayerCard() {
  const sessionId = useGameStore((s) => s.sessionId);
  const inArena = useGameStore((s) => s.room) === 'arena';
  useGameStore((s) => s.tick); // re-render ~20×/s so stats track the server
  const [compact, setCompact] = usePersistentToggle('arena.playercard.compact', false);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const def = getClassDefinition(me.characterClass);
  const { span, into } = xpProgress(me.level, me.xp);
  const kd = me.deaths > 0 ? (me.kills / me.deaths).toFixed(2) : me.kills.toFixed(2);

  const toggle = () => setCompact(!compact);

  const ToggleButton = (
    <IconButton
      icon={compact ? ChevronRight : ChevronDown}
      onClick={toggle}
      aria-label={compact ? 'Expand' : 'Collapse'}
      title={compact ? 'Expand' : 'Collapse'}
      className="pointer-events-auto ml-auto"
    />
  );

  // --- Compact: a slim bar with only the essentials ---
  if (compact) {
    return (
      <Card variant="hud" className="pointer-events-none w-64">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <LevelBadge level={me.level} color={def.color} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-display text-[14px] tracking-wide text-white">{me.name}</div>
            <div className="truncate text-[10px]" style={{ color: def.color }}>
              {def.name}
            </div>
          </div>
          {ToggleButton}
        </div>
        <div className="space-y-1.5 px-3 pb-2.5">
          {inArena ? (
            <>
              <Bar label="HP" value={me.hp} max={me.maxHp} color={STAT_COLORS.positive} />
              <Bar label="MP" value={me.mana} max={me.maxMana} color={STAT_COLORS.mana} />
            </>
          ) : (
            <Bar label="XP" value={into} max={span} color={def.color} />
          )}
        </div>
      </Card>
    );
  }

  // --- Expanded: paperdoll-style with a 3D portrait ---
  return (
    <Card variant="hud" className="pointer-events-none w-64 bg-panel/90">
      <div className="flex items-center gap-3 px-3 py-2.5" style={accentHeaderStyle(def.color)}>
        <LevelBadge level={me.level} color={def.color} size="lg" />
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] tracking-wide text-white">{me.name}</div>
          <div className="truncate text-[11px]" style={{ color: def.color }}>
            {def.name} · {def.role}
          </div>
        </div>
        {ToggleButton}
      </div>

      {/* 3D portrait (lite, auto-rotating). */}
      <div className="h-44 border-y border-white/5 bg-black/40">
        <ClassPreview characterClass={me.characterClass} lite />
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

        {inArena && (
          <div className="mt-3 space-y-1.5">
            <Bar label="HP" value={me.hp} max={me.maxHp} color={STAT_COLORS.positive} />
            <Bar label="MP" value={me.mana} max={me.maxMana} color={STAT_COLORS.mana} />
            {!me.alive && (
              <div className="pt-0.5 text-center text-[11px] font-semibold text-negative">
                Defeated — respawning…
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
