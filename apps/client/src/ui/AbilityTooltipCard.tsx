import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ABILITIES, describeAbility, type AbilityKind, type AbilitySlot } from '@arena/shared';

/** Devices with a real pointer (desktop) get hover tooltips; touch devices don't. */
const CAN_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches === true;

/** Estimated tooltip height; if the anchor is too near the top, flip below it. */
const FLIP_THRESHOLD_PX = 230;

/**
 * Wrap an ability's visible chip/slot to reveal a rich tooltip on hover. The
 * tooltip renders through a portal with fixed positioning, so it's never clipped
 * by a parent's `overflow` (e.g. the character-select Card) and always draws on
 * top. Touch devices get nothing (no hover).
 */
export function AbilityHover({
  ability,
  slot,
  children,
  className,
}: {
  ability: AbilityKind;
  slot?: AbilitySlot;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = () => {
    if (CAN_HOVER && ref.current) setRect(ref.current.getBoundingClientRect());
  };
  const hide = () => setRect(null);

  return (
    <div
      ref={ref}
      className={className ?? 'relative'}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {rect &&
        createPortal(
          <AbilityTooltipCard ability={ability} slot={slot} rect={rect} />,
          document.body,
        )}
    </div>
  );
}

/**
 * The tooltip body: the ability's name, aim/cost/cooldown stats, and a
 * plain-English breakdown of its effects with concrete values — all derived
 * from the registry (`describeAbility`), so it never drifts from what the
 * ability actually does. Positioned `fixed` relative to its anchor's rect.
 */
function AbilityTooltipCard({
  ability,
  slot,
  rect,
}: {
  ability: AbilityKind;
  slot?: AbilitySlot;
  rect: DOMRect;
}) {
  const t = describeAbility(ABILITIES[ability]);
  // Centered horizontally on the anchor; above it by default, flipped below when
  // there isn't room near the top of the viewport.
  const below = rect.top < FLIP_THRESHOLD_PX;
  const left = rect.left + rect.width / 2;
  const top = below ? rect.bottom + 8 : rect.top - 8;
  const style: React.CSSProperties = {
    position: 'fixed',
    left,
    top,
    transform: `translate(-50%, ${below ? '0' : '-100%'})`,
  };

  const stat = (label: string, value: string) => (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-xs font-semibold text-white tabular-nums">{value}</span>
    </div>
  );

  return (
    <div
      style={style}
      className="pointer-events-none z-100 w-60 rounded-lg border border-accent/30 bg-panel/95 p-3 text-left shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-accent">{t.name}</span>
        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
          {slot ? `${slot} · ${t.aimLabel}` : t.aimLabel}
        </span>
      </div>

      <div className="mt-2 flex justify-between gap-1 border-y border-white/10 py-1.5">
        {stat('CD', `${(t.cooldownMs / 1000).toFixed(t.cooldownMs % 1000 ? 1 : 0)}s`)}
        {stat('Mana', String(t.manaCost))}
        {t.castTimeMs > 0 && stat('Cast', `${(t.castTimeMs / 1000).toFixed(1)}s`)}
        {t.range > 0 && stat('Range', String(t.range))}
      </div>

      <ul className="mt-2 space-y-1">
        {t.lines.map((line, i) => (
          <li key={i} className="flex gap-1.5 text-xs leading-snug text-white/85">
            <span className="text-accent">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
