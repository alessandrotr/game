import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Shared visual language for the sidebar surfaces — matched to the town's "Trial
 * of Blades" matchmaking card: a translucent, heavily-blurred panel with a
 * borderless crest header (gold icon + container-query title) and the same quiet
 * close button. Kept here so the rail, the section panels, and the champion hub
 * all read as one family.
 */

/** The frosted card surface (position / width / animation are layered on top). */
export const PANEL_SURFACE =
  'flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/55 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl';

/** Borderless crest header: gold icon + title, with the close button (and any
 *  extra actions passed as `children`) on the right. */
export function SidebarHeader({
  icon: Icon,
  title,
  onClose,
  children,
}: {
  icon: LucideIcon;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4">
      <h2 className="flex items-center gap-2 font-display text-[clamp(0.95rem,2.8cqi,1.3rem)] font-semibold tracking-wide text-text">
        <Icon size={16} className="text-gold" aria-hidden="true" />
        {title}
      </h2>
      <div className="flex items-center gap-1.5">
        {children}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

/** Gold section label with a hairline divider tick — the matchmaking menu marker. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80">
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </span>
  );
}
