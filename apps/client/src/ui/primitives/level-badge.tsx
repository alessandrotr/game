import { cn } from '@/lib/utils';

/** Box + number sizing per scale. */
const SIZES = {
  sm: { box: 'h-9 w-9', text: 'text-[13px]' },
  md: { box: 'h-12 w-12', text: 'text-lg' },
  lg: { box: 'h-16 w-16', text: 'text-2xl' },
} as const;

export interface LevelBadgeProps {
  level: number;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Level gem — a UO-flavored diamond (the same motif as the difficulty pips) with
 * a crafted gold rim and a clean upright numeral. Dark faceted fill, no glow;
 * reads as prestige without competing with the gold primary action. Reused
 * wherever a player's level is shown (character select, paperdoll, …).
 */
export function LevelBadge({ level, size = 'md', className }: LevelBadgeProps) {
  const s = SIZES[size];
  return (
    <div
      role="img"
      aria-label={`Level ${level}`}
      className={cn('relative inline-grid shrink-0 place-items-center', s.box, s.text, className)}
    >
      {/* Gem frame: a rotated square with a faceted dark fill and gold rim. */}
      <span className="absolute inset-0 rotate-45 rounded-[24%] border border-gold/70 bg-linear-to-br from-panel to-bg" />
      {/* Inner hairline for a beveled, metalwork edge. */}
      <span className="absolute inset-[15%] rotate-45 rounded-[20%] border border-gold/25" />
      {/* Numeral, kept upright over the rotated gem. */}
      <span className="relative font-display font-bold leading-none text-gold tabular-nums">
        {level}
      </span>
    </div>
  );
}
