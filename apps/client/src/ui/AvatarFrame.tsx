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
  // `panel` (the large store/customize showcase) is deliberately restrained — a
  // thin, low-opacity edge + a faint inner tint, no bold halo or sweeping sheen,
  // so a full-color rim doesn't glare over the whole preview. The small round
  // avatars (HUD, carousel, swatches) keep the bolder neon treatment.
  const isPanel = shape === 'panel';
  const round = isPanel ? 'rounded-2xl' : 'rounded-full';

  return (
    <div className={cn('relative', className)} style={style}>
      {/* Outer glow halo — round avatars only; the panel skips it (too loud at size). */}
      {!isPanel && (
        <div
          aria-hidden
          className={cn('absolute inset-0 rounded-full', effect === 'pulse' && 'rim-pulse')}
          style={{ background: paint, filter: `blur(${m.glow}px)`, opacity: 0.55 }}
        />
      )}
      {/* The rim-colored edge — full strength on round avatars, a quiet hairline on the panel. */}
      <div
        aria-hidden
        className={cn('absolute inset-0', round, effect === 'prismatic' && 'rim-prismatic')}
        style={{ background: paint, opacity: isPanel ? 0.4 : 1 }}
      />
      {/* Glass panel, inset by the ring thickness, holding the portrait. The panel
          gets a soft inner tint instead of the outer halo. */}
      <div
        className={cn('absolute overflow-hidden bg-[#0a0c14]', round)}
        style={{ inset: isPanel ? 1.5 : m.edge, boxShadow: isPanel ? `inset 0 0 24px ${color}1f` : undefined }}
      >
        {children}
        {/* Diagonal sheen sweep — round avatars only (a sweep over the big panel reads as busy). */}
        {!isPanel && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3">
            <div className="rim-sheen h-full w-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
          </div>
        )}
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
