import { useEffect } from 'react';
import { getClassDefinition, xpForLevel } from '@arena/shared';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { X } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { ClassPreview } from './ClassPreview';
import { Card, IconButton, Meter, StatTile } from './primitives';

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
  const kd = data.deaths === 0 ? data.kills.toFixed(2) : (data.kills / data.deaths).toFixed(2);

  return (
    <Card variant="modal" className="pointer-events-auto absolute right-4 top-1/2 w-72 -translate-y-1/2">
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
        <IconButton icon={X} onClick={close} aria-label="Close" />
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
        <Meter
          layout="stacked"
          size="md"
          value={into}
          max={span}
          fill={`linear-gradient(90deg, ${def.color}, #ffffffcc)`}
          label="XP"
          valueText={`${into} / ${span}`}
          headerClassName="mb-1 text-[11px] text-muted"
        />
      </div>

      {/* Record */}
      <div className="flex gap-2 px-4 py-3">
        <StatTile variant="bordered" label="Kills" value={data.kills} color="#5fe08a" />
        <StatTile variant="bordered" label="Deaths" value={data.deaths} color="#ff7a7a" />
        <StatTile variant="bordered" label="K/D" value={kd} color="#e6e9f5" />
      </div>
    </Card>
  );
}
