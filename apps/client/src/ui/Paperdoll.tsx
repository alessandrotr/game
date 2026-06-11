import { useEffect } from 'react';
import { getClassDefinition, xpForLevel } from '@arena/shared';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { useGameStore } from '../store/useGameStore';
import { ClassPreview } from './ClassPreview';

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-center">
      <div className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

/**
 * UO-style "paperdoll": click another player in town to inspect them. Shows a
 * rotatable 3D portrait of their class plus their name, level, XP, and record.
 * Data is a snapshot taken on open; closes on Escape, the ✕, or leaving town.
 */
export function Paperdoll() {
  const data = usePaperdollStore((s) => s.data);
  const close = usePaperdollStore((s) => s.close);
  const room = useGameStore((s) => s.room);

  // Close when leaving town or on Escape.
  useEffect(() => {
    if (data && room !== 'town') close();
  }, [data, room, close]);
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, close]);

  if (!data) return null;

  const def = getClassDefinition(data.characterClass);
  const levelStart = xpForLevel(data.level);
  const levelEnd = xpForLevel(data.level + 1);
  const span = Math.max(1, levelEnd - levelStart);
  const into = Math.max(0, Math.min(span, data.xp - levelStart));
  const xpPct = (into / span) * 100;
  const kd = data.deaths === 0 ? data.kills.toFixed(2) : (data.kills / data.deaths).toFixed(2);

  return (
    <div className="pointer-events-auto absolute right-4 top-1/2 w-72 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-panel/95 shadow-2xl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: `linear-gradient(90deg, ${def.color}33, transparent)` }}
      >
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-bold tracking-wide text-text">
            {data.name}
          </div>
          <div className="text-xs font-medium" style={{ color: def.color }}>
            Level {data.level} {def.name}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="text-muted transition hover:text-text"
        >
          ✕
        </button>
      </div>

      {/* 3D portrait */}
      <div className="relative h-56 border-y border-white/5 bg-black/40">
        <ClassPreview characterClass={data.characterClass} />
        <div className="pointer-events-none absolute right-3 top-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
          drag to rotate
        </div>
      </div>

      {/* XP bar */}
      <div className="px-4 pt-3">
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>XP</span>
          <span className="tabular-nums">
            {into} / {span}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/50">
          <div
            className="h-full rounded-full"
            style={{ width: `${xpPct}%`, background: `linear-gradient(90deg, ${def.color}, #ffffffcc)` }}
          />
        </div>
      </div>

      {/* Record */}
      <div className="flex gap-2 px-4 py-3">
        <Stat label="Kills" value={data.kills} color="#5fe08a" />
        <Stat label="Deaths" value={data.deaths} color="#ff7a7a" />
        <Stat label="K/D" value={kd} color="#e6e9f5" />
      </div>
    </div>
  );
}
