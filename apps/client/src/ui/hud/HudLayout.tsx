import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * HUD zone system — the single place that owns where on-screen chrome lives.
 *
 * `HudLayout` is one full-screen, click-through layer (`pointer-events-none`) at
 * the base `z-hud` level; every interactive descendant opts back in with
 * `pointer-events-auto`, exactly as the rest of the HUD already does — so the 3D
 * canvas underneath keeps receiving drags/clicks through the gaps.
 *
 * `HudZone` places its children in a named screen region. Components no longer
 * hard-code `absolute left-4 top-4 …`; they declare a `zone` and the layout owns
 * the geometry. This keeps the corners consistent and lets the whole chrome layer
 * be hidden at once (see `useHudStore`).
 */

export type ZoneName =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center';

/** Geometry per zone. Mirrors the pre-refactor positions pixel-for-pixel. */
const ZONE_CLASS: Record<ZoneName, string> = {
  'top-left': 'absolute left-4 top-4 flex lg:w-64 flex-col items-stretch gap-2',
  'top-right': 'absolute right-4 top-16 flex flex-col items-end gap-2',
  'top-center': 'absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1',
  'bottom-left': 'absolute bottom-4 left-4',
  'bottom-center': 'absolute bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'absolute bottom-4 right-4',
  // Non-interactive use only — a `pointer-events-auto` child here would block the
  // whole screen. Modals use their own portalled overlay instead.
  center: 'absolute inset-0 flex items-center justify-center',
};

export interface HudZoneProps extends HTMLAttributes<HTMLDivElement> {
  zone: ZoneName;
}

export function HudZone({ zone, className, ...props }: HudZoneProps) {
  return <div className={cn('pointer-events-none', ZONE_CLASS[zone], className)} {...props} />;
}

/** The base chrome layer. Render zones as children. */
export function HudLayout({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none fixed inset-0 z-hud">{children}</div>;
}
