import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The app's button styles, extracted from the screens that repeated them.
 * `gold` is the primary call-to-action gradient; the rest cover the panel
 * chips, outline pills, and bare icon buttons (✕ ▾ ▸) used across the HUD.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/80 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60',
  {
  variants: {
    variant: {
      gold: 'font-display rounded-xl border border-gold/60 bg-linear-to-b from-gold to-gold-dark font-semibold tracking-wide text-black shadow-[0_8px_24px_rgba(200,162,74,0.25)] hover:brightness-110 disabled:cursor-progress',
      goldOutline:
        'font-display rounded-xl border border-gold/50 bg-panel/90 tracking-wide text-gold hover:brightness-110',
      panel:
        'rounded-xl border border-white/10 bg-panel/85 tracking-wide text-muted hover:text-text hover:brightness-110',
      outline: 'rounded-lg border border-white/10 hover:border-white/30 hover:text-text',
      ghost: 'rounded text-muted hover:text-text',
    },
    size: {
      sm: 'px-2.5 py-1 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-4 py-3 text-base',
      icon: 'rounded px-1.5 text-sm',
      none: '',
    },
  },
  defaultVariants: { variant: 'panel', size: 'md' },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
