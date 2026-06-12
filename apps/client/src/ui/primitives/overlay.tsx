import { useEffect, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  children: ReactNode;
  /** Called when the user dismisses via the backdrop or Escape. */
  onClose?: () => void;
  /** Close when clicking the dimmed backdrop (not the content). Default true. */
  closeOnBackdrop?: boolean;
  /** Close when pressing Escape. Default false. */
  closeOnEscape?: boolean;
}

/**
 * Full-screen modal backdrop used inside the game's HUD layer. Centers its
 * content over a dimmed/blurred screen. Intentionally not a Radix Dialog: these
 * overlays live within the canvas's pointer-events-managed absolute layer, so a
 * body portal + focus trap would fight that model. Dismissal is opt-in per use:
 * a click is treated as the backdrop only when it lands on the backdrop itself.
 */
export function Overlay({
  children,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = false,
  className,
  ...props
}: OverlayProps) {
  useEffect(() => {
    if (!closeOnEscape || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnEscape, onClose]);

  return (
    <div
      className={cn(
        'pointer-events-auto absolute inset-0 z-modal flex items-center justify-center bg-black/70 backdrop-blur-sm',
        className,
      )}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
      {...props}
    >
      {children}
    </div>
  );
}
