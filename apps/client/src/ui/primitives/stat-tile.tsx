import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statTileVariants = cva('rounded-lg bg-black/30', {
  variants: {
    variant: {
      plain: 'py-1.5',
      bordered: 'flex-1 border border-white/10 px-2 py-1.5 text-center',
    },
  },
  defaultVariants: { variant: 'plain' },
});

export interface StatTileProps extends VariantProps<typeof statTileVariants> {
  label: ReactNode;
  value: ReactNode;
  /** Value color (per-stat: kills green, deaths red, …). */
  color: string;
  className?: string;
}

/** Small stat block (Kills / Deaths / K/D) used by the player card & paperdoll. */
export function StatTile({ label, value, color, variant, className }: StatTileProps) {
  return (
    <div className={cn(statTileVariants({ variant }), className)}>
      <div className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
