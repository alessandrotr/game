import { useEffect, useRef, useState } from 'react';
import { useOnClickOutside } from 'usehooks-ts';
import { getClassDefinition, getCosmeticOfType, xpProgress } from '@arena/shared';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { X } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { fetchPublicPaint } from '../network/paint';
import { applyClassPaint, paintTexturesFor, type PaintTextures } from '../paint/paintSurface';
import { ClassPreview } from './ClassPreview';
import { AvatarFrame } from './AvatarFrame';
import { rimColorOf } from './rim';
import { Card, IconButton, LevelBadge, Meter, StatTile } from './primitives';
import { STAT_COLORS } from './theme';

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

  return <PaperdollCard data={data} close={close} />;
}

/** Split out so the paint-fetch hooks run with a guaranteed non-null `data`. */
function PaperdollCard({
  data,
  close,
}: {
  data: NonNullable<ReturnType<typeof usePaperdollStore.getState>['data']>;
  close: () => void;
}) {
  // Close when clicking anywhere outside the card — but ignore the very press that
  // opened it. The paperdoll opens on a canvas pointerdown, and the click-outside
  // listener attaches synchronously (layout effect) during that same discrete
  // event, so without this guard the opening press's mousedown closes it instantly.
  const cardRef = useRef<HTMLDivElement>(null);
  const openedAt = usePaperdollStore((s) => s.openedAt);
  useOnClickOutside(cardRef, () => {
    if (Date.now() - openedAt > 250) close();
  });

  // Fetch the inspected player's custom paint (by account id) and apply it to a
  // paperdoll-scoped surface so the portrait shows THEIR look, not the viewer's.
  const [paint, setPaint] = useState<PaintTextures | undefined>(undefined);
  useEffect(() => {
    setPaint(undefined);
    if (!data.pid) return;
    let cancelled = false;
    const owner = `pd:${data.pid}`;
    void fetchPublicPaint(data.pid)
      .then(async (state) => {
        const cls = state[data.characterClass];
        if (!cls || !Object.keys(cls).length) return;
        await applyClassPaint(owner, cls);
        if (!cancelled) setPaint(paintTexturesFor(owner));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data.pid, data.characterClass]);

  const def = getClassDefinition(data.characterClass);
  const { span, into } = xpProgress(data.level, data.xp);
  const kd = data.deaths === 0 ? data.kills.toFixed(2) : (data.kills / data.deaths).toFixed(2);
  const title = data.titleId ? getCosmeticOfType(data.titleId, 'title') : undefined;

  return (
    <Card ref={cardRef} variant="modal" className="pointer-events-auto absolute right-4 top-1/2 w-72 -translate-y-1/2">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <LevelBadge level={data.level} size="md" color={rimColorOf(data.rimId)} />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold tracking-wide text-text">
              {data.name}
            </div>
            <div className="text-xs font-medium text-muted">{def.name}</div>
            {title && (
              <div className="truncate text-[10px] uppercase tracking-wider" style={{ color: title.color }}>
                {title.text}
              </div>
            )}
          </div>
        </div>
        <IconButton icon={X} onClick={close} aria-label="Close" />
      </div>

      {/* 3D portrait — framed by the player's equipped avatar rim (panel shape so
          the full body + pedestal read; a circle would crop them). */}
      <div className="border-y border-white/5 bg-black/40 p-3">
        <AvatarFrame rimId={data.rimId} shape="panel" size="md" className="h-56">
          <ClassPreview
            characterClass={data.characterClass}
            skinId={data.skinId}
            dyeId={data.dyeId}
            pedestalId={data.pedestalId}
            paint={paint}
          />
          <div className="pointer-events-none absolute right-3 top-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
            drag to rotate
          </div>
        </AvatarFrame>
      </div>

      {/* XP bar */}
      <div className="px-4 pt-3">
        <Meter
          layout="stacked"
          size="md"
          value={into}
          max={span}
          fill={`linear-gradient(90deg, var(--color-gold-dark), ${STAT_COLORS.xpTip})`}
          label="XP"
          valueText={`${into} / ${span}`}
          headerClassName="mb-1 text-[11px] text-muted"
        />
      </div>

      {/* Record */}
      <div className="flex gap-2 px-4 py-3">
        <StatTile variant="bordered" label="Kills" value={data.kills} color={STAT_COLORS.positive} />
        <StatTile variant="bordered" label="Deaths" value={data.deaths} color={STAT_COLORS.negative} />
        <StatTile variant="bordered" label="K/D" value={kd} color={STAT_COLORS.text} />
      </div>
    </Card>
  );
}
