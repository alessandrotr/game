import { useState } from 'react';
import { getClassDefinition, xpForLevel } from '@arena/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { ClassPreview } from './ClassPreview';
import { Card, IconButton, Meter, StatTile } from './primitives';

const COMPACT_KEY = 'arena.playercard.compact';
function loadCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}
function saveCompact(v: boolean): void {
  try {
    localStorage.setItem(COMPACT_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

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
  const [compact, setCompact] = useState(loadCompact);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const def = getClassDefinition(me.characterClass);
  const levelStart = xpForLevel(me.level);
  const levelEnd = xpForLevel(me.level + 1);
  const span = Math.max(1, levelEnd - levelStart);
  const into = Math.max(0, Math.min(span, me.xp - levelStart));
  const kd = me.deaths > 0 ? (me.kills / me.deaths).toFixed(2) : me.kills.toFixed(2);

  const toggle = () => {
    setCompact((c) => {
      saveCompact(!c);
      return !c;
    });
  };

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
              <Bar label="HP" value={me.hp} max={me.maxHp} color="#4ade80" />
              <Bar label="MP" value={me.mana} max={me.maxMana} color="#60a5fa" />
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
      <div
        className="flex items-center gap-3 px-3 py-2.5"
        style={{ background: `linear-gradient(90deg, ${def.color}26, transparent)` }}
      >
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
          fill={`linear-gradient(90deg, ${def.color}, #ffffffcc)`}
          label="XP"
          valueText={`${Math.round(into)} / ${span}`}
          headerClassName="mb-1 items-baseline"
          labelClassName="text-[10px] uppercase tracking-wide text-muted"
          valueClassName="text-[10px] text-white/60"
          trackClassName="bg-black/45"
          fillClassName="transition-[width] duration-300"
        />

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <StatTile label="Kills" value={me.kills} color="#5fe08a" />
          <StatTile label="Deaths" value={me.deaths} color="#ff7a7a" />
          <StatTile label="K/D" value={kd} color="#e6e9f5" />
        </div>

        {inArena && (
          <div className="mt-3 space-y-1.5">
            <Bar label="HP" value={me.hp} max={me.maxHp} color="#4ade80" />
            <Bar label="MP" value={me.mana} max={me.maxMana} color="#60a5fa" />
            {!me.alive && (
              <div className="pt-0.5 text-center text-[11px] font-semibold text-red-400">
                Defeated — respawning…
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
