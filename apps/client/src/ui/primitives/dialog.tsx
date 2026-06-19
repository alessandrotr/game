import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

/**
 * Accessible modal dialog (Radix-backed, shadcn pattern), skinned to the app's
 * panel/gold theme. Unlike the lightweight `Overlay`, this gives a focus trap,
 * focus restore, `role="dialog"`/`aria-modal`, and Escape-to-close — so it's the
 * right tool for genuinely dismissible modals (e.g. the leaderboard). Content is
 * portalled to `document.body` and the rest of the app is inert while open.
 *
 * No default close button is rendered: place a `<DialogClose asChild>` yourself
 * (the leaderboard puts a ✕ in its header).
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-modal bg-black/70 backdrop-blur-sm', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** `center` (default) is the classic centered modal; `right` docks the panel to
   *  the right edge, vertically centered — for the cinematic focus, where the 3D
   *  subject sits screen-left and the panel beside it. */
  dock?: 'center' | 'right';
  /** Render the dimming backdrop. Set false (with `dock="right"`) so the focused
   *  3D scene stays fully visible behind a transparent, click-to-close overlay. */
  backdrop?: boolean;
}

const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, dock = 'center', backdrop = true, ...props }, ref) => (
    <DialogPortal>
      {/* Docked: fully transparent + click-to-close. The readability scrim lives on
          the HUD title itself (FocusTitle), so the dialog's portal can't paint over
          it — keeping the big title legible regardless of stacking order. */}
      <DialogOverlay className={backdrop ? undefined : 'bg-transparent backdrop-blur-none'} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-modal w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-panel/95 shadow-2xl focus:outline-none',
          dock === 'right'
            // Viewport-relative width so the docked panel scales up on a big 2K
            // canvas instead of staying a small fixed card (with a readable floor).
            ? 'right-[2vw] top-1/2 max-w-[clamp(26rem,28vw,40rem)] -translate-y-1/2'
            : 'left-1/2 top-1/2 max-w-lg -translate-x-1/2 -translate-y-1/2',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={className} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={className} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
};
