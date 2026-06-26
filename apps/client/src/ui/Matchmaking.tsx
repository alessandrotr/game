import { useEffect } from 'react';
import { useQueueStore } from '../store/useQueueStore';
import { useFocusStore } from '../store/useFocusStore';
import { MatchmakingMenu } from './MatchmakingMenu';

/**
 * Matchmaking overlay: the format-queue panel. Entry is diegetic — opened from the
 * town "Trial of Blades" duel shrine (see scene/TownDuelAltar.tsx) via
 * `useQueueStore.setMenuOpen`; there is no HUD button. Mounted town-only by the
 * HUD; the matchmaking connection runs in parallel with the town room, so the
 * player keeps walking around while queued (the queue badge tracks fill). When a
 * match forms the client is pulled straight into the arena — no ready-check.
 */
export function Matchmaking() {
  const menuOpen = useQueueStore((s) => s.menuOpen);

  // Hold the cinematic shrine focus while the panel is open; release on close.
  useEffect(() => {
    if (!menuOpen) useFocusStore.getState().clear('pvp');
  }, [menuOpen]);
  useEffect(() => () => useFocusStore.getState().clear('pvp'), []);

  if (!menuOpen) return null;
  return <MatchmakingMenu />;
}
