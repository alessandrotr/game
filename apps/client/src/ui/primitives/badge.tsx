import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Pill/chip. `gold` = class ability tags, `accent` = unread chat count,
 * `neutral` = HUD info chips (online count).
 */
const badgeVariants = cva('inline-flex items-center rounded-full', {
  variants: {
    variant: {
      gold: 'border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-wider text-gold',
      accent: 'bg-accent/20 px-1.5 text-[11px] font-semibold text-accent',
      neutral: 'border border-white/10 bg-panel/80 px-3 py-1.5 text-xs text-muted backdrop-blur-sm',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
