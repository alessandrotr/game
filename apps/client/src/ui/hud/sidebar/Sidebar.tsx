import { useEffect, useRef } from 'react';
import { useControlsStore } from '../../../store/useControlsStore';
import { useCustomizeStore } from '../../../store/useCustomizeStore';
import { SidebarRail } from './SidebarRail';
import { SidebarPanel } from './SidebarPanel';
import { ChampionPanel } from './ChampionPanel';
import { useSidebarStore } from './useSidebarStore';

/**
 * The unified town sidebar — an always-visible icon rail on the right edge plus
 * the content panel that expands beside it. The single replacement for the old
 * bottom-right game menu, settings/controls dialogs, and (incrementally) the
 * wardrobe + leaderboard. Town-only; hidden with the rest of the chrome by `H`.
 */
export function Sidebar() {
  const rootRef = useRef<HTMLDivElement>(null);

  // First-session affordance: auto-open the controls reference once for new
  // players. Reuses the controls store's persisted "seen" flag (the old dialog's
  // auto-open behaviour) without keeping the dialog itself.
  useEffect(() => {
    if (useControlsStore.getState().open) {
      useSidebarStore.getState().open('controls');
      useControlsStore.getState().setOpen(false);
    }
  }, []);

  // Collapse on Escape or a click outside the rail/panel. While the full-screen
  // paint studio is open it owns Escape (and covers the sidebar), so stand down —
  // closing paint should return to the hub, not collapse it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useCustomizeStore.getState().paintOpen) return;
      if (e.key === 'Escape' && useSidebarStore.getState().active !== null) {
        useSidebarStore.getState().close();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (useCustomizeStore.getState().paintOpen) return;
      if (useSidebarStore.getState().active === null) return;
      if (!rootRef.current?.contains(e.target as Node)) useSidebarStore.getState().close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none fixed inset-y-0 right-0 z-popover">
      <SidebarPanel />
      <ChampionPanel />
      <div className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2">
        <SidebarRail />
      </div>
    </div>
  );
}
