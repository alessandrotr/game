import { cn } from '@/lib/utils';

/** Box + number sizing per scale. */
const SIZES = {
  xxs: { box: 'h-6 w-6', text: 'text-[10px]' },
  xs: { box: 'h-7 w-7', text: 'text-[11px]' },
  sm: { box: 'h-9 w-9', text: 'text-[13px]' },
  md: { box: 'h-12 w-12', text: 'text-lg' },
  lg: { box: 'h-16 w-16', text: 'text-2xl' },
} as const;

export interface LevelBadgeProps {
  level: number;
  size?: keyof typeof SIZES;
  /** Tint the gem's rim + numeral + glow (e.g. to match an equipped avatar rim).
   *  Must be a 6-digit hex. Omit for the default gold prestige gem. */
  color?: string;
  className?: string;
}

/**
 * Level gem — a UO-flavored diamond (the same motif as the difficulty pips) with
 * a crafted rim and a clean upright numeral. Gold by default; pass `color` to
 * tint it (the avatar frame feeds it the equipped rim's color so the gem matches
 * the rim). Reused wherever a player's level is shown (character select, HUD, …).
 */
export function LevelBadge({ level, size = 'md', color, className }: LevelBadgeProps) {
  const s = SIZES[size];
  const tinted = !!color;
  return (
    <div
      role="img"
      aria-label={`Level ${level}`}
      className={cn('relative inline-grid shrink-0 place-items-center', s.box, s.text, className)}
    >
      {/* Gem frame: a rotated square with a faceted dark fill and a rim-colored edge. */}
      <span
        className={cn(
          'absolute inset-0 rotate-45 rounded-[24%] border bg-linear-to-br from-panel to-bg',
          !tinted && 'border-gold/70',
        )}
        style={tinted ? { borderColor: `${color}b3`, boxShadow: `0 0 8px ${color}59` } : undefined}
      />
      {/* Inner hairline for a beveled, metalwork edge. */}
      <span
        className={cn('absolute inset-[15%] rotate-45 rounded-[20%] border', !tinted && 'border-gold/25')}
        style={tinted ? { borderColor: `${color}40` } : undefined}
      />
      {/* Numeral, kept upright over the rotated gem. */}
      <span
        className={cn('relative font-display font-bold leading-none tabular-nums', !tinted && 'text-gold')}
        style={tinted ? { color } : undefined}
      >
        {level}
      </span>
    </div>
  );
}
