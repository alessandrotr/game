import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Bordered panel container. `modal` is the centered dialog card; `hud` is the
 * translucent, blurred HUD panel (player card); `inset` is the darker nested
 * block used for grouped content (e.g. class stats).
 */
const cardVariants = cva('overflow-hidden border', {
  variants: {
    variant: {
      modal: 'rounded-2xl border-white/10 bg-panel/95 shadow-2xl',
      hud: 'rounded-2xl border-white/10 bg-panel/85 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md',
      inset: 'rounded-xl border-white/10 bg-black/30 p-4',
    },
  },
  defaultVariants: { variant: 'modal' },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
));
Card.displayName = 'Card';
