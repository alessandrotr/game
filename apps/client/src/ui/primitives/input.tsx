import { forwardRef, type InputHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Text input shared by the auth form and the chat box. `tone` picks the focus
 * accent (gold for forms, blue accent for chat); `inputSize` covers the two
 * paddings/roundings those two surfaces use.
 */
const inputVariants = cva('border border-white/15 outline-none transition focus-visible:ring-2', {
  variants: {
    tone: {
      gold: 'focus:border-gold focus-visible:ring-gold/40',
      accent: 'focus:border-accent focus-visible:ring-accent/40',
    },
    inputSize: {
      md: 'rounded-xl bg-black/40 px-4 py-3 text-[15px]',
      sm: 'rounded-lg bg-black/50 px-3 py-2 text-[13px]',
    },
  },
  defaultVariants: { tone: 'gold', inputSize: 'md' },
});

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, tone, inputSize, ...props }, ref) => (
    <input ref={ref} className={cn(inputVariants({ tone, inputSize }), className)} {...props} />
  ),
);
Input.displayName = 'Input';
