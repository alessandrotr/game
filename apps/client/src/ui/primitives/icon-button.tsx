import { forwardRef } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children'> {
  /** The Lucide icon to render. */
  icon: LucideIcon;
  /** Required: icon-only controls must have an accessible name. */
  'aria-label': string;
  /** Icon box size in pixels. */
  iconSize?: number;
}

/**
 * Square, icon-only button (close ✕, chevrons, …). Wraps `Button` so it shares
 * focus rings/variants, forces an `aria-label`, and marks the glyph decorative.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, className, variant = 'ghost', iconSize = 16, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size="none"
      className={cn('rounded p-1', className)}
      {...props}
    >
      <Icon size={iconSize} aria-hidden="true" />
    </Button>
  ),
);
IconButton.displayName = 'IconButton';
