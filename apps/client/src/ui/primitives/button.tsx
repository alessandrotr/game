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
      // Juicy primary CTA (e.g. Store "Unlock"): a gold gradient with subtle
      // diagonal stripes (::before) and a bright sheen that sweeps across
      // (::after, animate-cta-sheen). `isolate` + negative-z pseudos keep both
      // layers behind the label. Lifts + brightens on hover for that tactile,
      // rewarding press.
      goldCta:
        "relative isolate overflow-hidden font-display rounded-xl border border-amber-200/50 bg-linear-to-br from-[#dcbb63] via-[#c8a24a] to-[#9c7a2c] font-bold tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] shadow-[0_6px_20px_rgba(200,162,74,0.45)] hover:scale-[1.03] hover:brightness-110 active:scale-95 disabled:cursor-progress before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-[repeating-linear-gradient(115deg,transparent_0px,transparent_12px,rgba(255,255,255,0.13)_12px,rgba(255,255,255,0.13)_20px)] after:content-[''] after:absolute after:inset-y-0 after:left-0 after:-z-10 after:w-1/3 after:bg-linear-to-r after:from-transparent after:via-white/45 after:to-transparent after:animate-cta-sheen",
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
