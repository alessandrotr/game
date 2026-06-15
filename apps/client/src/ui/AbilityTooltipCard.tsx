import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ABILITIES, describeAbility, type AbilityKind, type AbilitySlot } from '@arena/shared';
import { ABILITY_ICON } from './abilityIcons';

/** Devices with a real pointer (desktop) get hover tooltips; touch devices don't. */
const CAN_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches === true;

/** Estimated tooltip height; if the anchor is too near the top, flip below it. */
const FLIP_THRESHOLD_PX = 260;
/** Tooltip width (px) and viewport margin, used to keep it on-screen on mobile. */
const TOOLTIP_W = 256;
const VIEWPORT_MARGIN = 8;

/**
 * Wrap an ability's visible chip/slot to reveal a rich tooltip. On desktop it
 * shows on hover; pass `tapToShow` to also let touch devices toggle it on tap
 * (used by the character-select picker, NOT the in-game action bar where a tap
 * means "cast"). The tooltip renders through a portal with fixed positioning, so
 * it's never clipped by a parent's `overflow` and always draws on top.
 */
export function AbilityHover({
  ability,
  slot,
  children,
  className,
  tapToShow = false,
}: {
  ability: AbilityKind;
  slot?: AbilitySlot;
  children: React.ReactNode;
  className?: string;
  tapToShow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
  };
  const hide = () => setRect(null);

  // Touch: dismiss on the next outside tap or any scroll.
  useEffect(() => {
    if (!rect || CAN_HOVER) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) hide();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', hide, true);
    };
  }, [rect]);

  return (
    <div
      ref={ref}
      className={className ?? 'relative'}
      onMouseEnter={CAN_HOVER ? show : undefined}
      onMouseLeave={CAN_HOVER ? hide : undefined}
      onClick={!CAN_HOVER && tapToShow ? () => (rect ? hide() : show()) : undefined}
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
 * The tooltip body: an iconed header, the ability's aim/cost/cooldown stats as
 * chips, and a plain-English breakdown of its effects with concrete values — all
 * derived from the registry (`describeAbility`), so it never drifts from what the
 * ability actually does. Positioned `fixed` relative to its anchor's rect, clamped
 * to the viewport, with a caret pointing back at the anchor.
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
  const Icon = ABILITY_ICON[ability];

  // A short entrance: fade + lift in on the frame after mount.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Above the anchor by default; flipped below when it's near the top. Clamped
  // horizontally so it never runs off a narrow (mobile) screen.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const below = rect.top < FLIP_THRESHOLD_PX;
  const anchorCenter = rect.left + rect.width / 2;
  const leftEdge = Math.min(
    Math.max(anchorCenter - TOOLTIP_W / 2, VIEWPORT_MARGIN),
    vw - TOOLTIP_W - VIEWPORT_MARGIN,
  );
  const caretLeft = Math.min(Math.max(anchorCenter - leftEdge, 18), TOOLTIP_W - 18);
  const style: React.CSSProperties = {
    position: 'fixed',
    left: leftEdge,
    top: below ? rect.bottom + 10 : rect.top - 10,
    width: TOOLTIP_W,
    transform: below ? 'none' : 'translateY(-100%)',
  };

  const chip = (label: string, value: string, accent = false) => (
    <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1">
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${accent ? 'text-mana' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={style} className="pointer-events-none z-tooltip">
      <div
        className={`relative transition duration-150 ease-out ${below ? 'origin-top' : 'origin-bottom'} ${
          shown ? 'translate-y-0 scale-100 opacity-100' : `scale-95 opacity-0 ${below ? '-translate-y-1' : 'translate-y-1'}`
        }`}
      >
        <div className="overflow-hidden rounded-xl border border-accent/40 bg-linear-to-b from-panel/95 to-bg/95 shadow-[0_10px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(108,140,255,0.12)] backdrop-blur-md">
          {/* Header: iconed medallion + name + aim/slot tag. */}
          <div className="flex items-center gap-2.5 border-b border-white/10 bg-accent/10 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{t.name}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-accent/80">
                {slot ? `${slot} · ${t.aimLabel}` : t.aimLabel}
              </div>
            </div>
          </div>

          {/* Stat chips. */}
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {chip('CD', `${(t.cooldownMs / 1000).toFixed(t.cooldownMs % 1000 ? 1 : 0)}s`)}
            {chip('Mana', String(t.manaCost), true)}
            {t.castTimeMs > 0 && chip('Cast', `${(t.castTimeMs / 1000).toFixed(1)}s`)}
            {t.range > 0 && chip('Range', String(t.range))}
          </div>

          {/* Effect breakdown. */}
          <ul className="space-y-1 px-3 pb-3 pt-2.5">
            {t.lines.map((line, i) => (
              <li key={i} className="flex gap-1.5 text-xs leading-snug text-white/85">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Caret pointing back at the anchor. */}
        <span
          className={`absolute h-2.5 w-2.5 rotate-45 border-accent/40 ${
            below ? '-top-1 border-l border-t bg-panel' : '-bottom-1 border-b border-r bg-bg'
          }`}
          style={{ left: caretLeft, marginLeft: -5 }}
        />
      </div>
    </div>
  );
}
