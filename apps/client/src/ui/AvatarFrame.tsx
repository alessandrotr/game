import { type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LevelBadge } from './primitives';
import { resolveRim, ringPaint } from './rim';

/**
 * The branded, store-facing avatar frame — a modern "esports" rim drawn around a
 * ROUND character portrait (or any avatar): a glowing rarity/rim-colored ring, an
 * animated sheen, and an optional level gem on the ring. Avatars are always round,
 * so the rim is a circular ring that fits every portrait (HUD, carousel, store).
 * The rim is data-driven by a `rim.*` cosmetic id, so new store rims plug in with
 * zero component changes. Purely 2D UI — it never touches the scene.
 */

/** Per-size chrome metrics: neon ring thickness + glow blur (px). */
const SIZE = {
  sm: { edge: 2, glow: 6 },
  md: { edge: 3, glow: 10 },
  lg: { edge: 4, glow: 18 },
} as const;

type FrameSize = keyof typeof SIZE;

export interface AvatarFrameProps {
  /** Equipped rim cosmetic id ('' / unknown → standard frame). */
  rimId?: string;
  /** The portrait / avatar to frame (fills the inner panel). */
  children: ReactNode;
  /** Level gem pinned to the bottom of the ring (omit to hide). */
  level?: number;
  /** Chrome scale — `lg` for the showcase, `sm` for compact cards. */
  size?: FrameSize;
  /** `circle` (a round avatar — the default) or `panel` (a rounded-rectangle
   *  frame, for a full-body preview that can't be cropped to a circle). */
  shape?: 'circle' | 'panel';
  /** Sizing/layout classes for the frame root (keep SQUARE for `circle`). */
  className?: string;
  /** Inline sizing for the frame root (e.g. a px width/height for a swatch). */
  style?: CSSProperties;
}

export function AvatarFrame({
  rimId,
  children,
  level,
  size = 'lg',
  shape = 'circle',
  className,
  style,
}: AvatarFrameProps) {
  const { color, color2, effect } = resolveRim(rimId);
  const m = SIZE[size];
  const paint = ringPaint(effect, color, color2);
  const round = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  return (
    <div className={cn('relative', className)} style={style}>
      {/* Outer glow — a blurred ring in the rim color; pulse rims breathe it. */}
      <div
        aria-hidden
        className={cn('absolute inset-0', round, effect === 'pulse' && 'rim-pulse')}
        style={{ background: paint, filter: `blur(${m.glow}px)`, opacity: 0.7 }}
      />
      {/* Neon ring (the colored border) — prismatic rims rotate their hue. */}
      <div
        aria-hidden
        className={cn('absolute inset-0', round, effect === 'prismatic' && 'rim-prismatic')}
        style={{ background: paint }}
      />
      {/* Glass panel, inset by the ring thickness, holding the portrait. */}
      <div className={cn('absolute overflow-hidden bg-[#0a0c14]', round)} style={{ inset: m.edge }}>
        {children}
        {/* Diagonal sheen sweep across the glass. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3">
          <div className="rim-sheen h-full w-full bg-linear-to-r from-transparent via-white/12 to-transparent" />
        </div>
      </div>
      {/* Level gem riding the bottom of the ring — tinted to match the rim. */}
      {level !== undefined && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3">
          <LevelBadge level={level} size={size === 'sm' ? 'xs' : 'md'} color={color} />
        </div>
      )}
    </div>
  );
}
