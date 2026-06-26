import { useEffect } from 'react';
import { Skull } from 'lucide-react';
import { ZOMBIE_COOP_MAX_PLAYERS } from '@arena/shared';
import { findMyZombieLobby, useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { myQueueMode, useQueueStore } from '../store/useQueueStore';
import { useHudStore } from '../store/useHudStore';
import { ZombieLobbyView } from './ZombieLobbyView';

/**
 * The player's own co-op squad as a MAIN-HUD element, mirroring {@link MatchQueue}:
 * a notification-style button (top-right, shown whenever you're in a squad) and a
 * standalone dialog opened from it — independent of the matchmaking menu + focus.
 * Stacks below the perf readout and the PvP queue button when those are present.
 */
export function ZombieMatchQueue() {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const mySessionId = useZombieLobbyStore((s) => s.mySessionId);
  const queueOpen = useZombieLobbyStore((s) => s.queueOpen);
  const setQueueOpen = useZombieLobbyStore((s) => s.setQueueOpen);
  const showPerf = useHudStore((s) => s.showPerf);

  // Whether the PvP queue button is also showing, so we can stack below it.
  const pvpMembers = useQueueStore((s) => s.members);
  const pvpSession = useQueueStore((s) => s.mySessionId);
  const pvpQueued = myQueueMode(pvpMembers, pvpSession) !== null;

  const myLobby = findMyZombieLobby(lobbies, mySessionId);
  const queuing = myLobby?.status === 'queuing' ? myLobby : null;

  useEffect(() => {
    if (!queuing && queueOpen) setQueueOpen(false);
  }, [queuing, queueOpen, setQueueOpen]);

  if (!queuing) return null;

  // Stack: below the perf readout (if shown) and below the PvP queue button (if any).
  const top = (showPerf ? 68 : 16) + (pvpQueued ? 48 : 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setQueueOpen(true)}
        style={{ top }}
        className="pointer-events-auto fixed right-4 z-modal flex items-center gap-2 rounded-xl border border-gold/50 bg-panel/80 px-3 py-2 text-sm font-semibold tracking-wide text-gold shadow-lg backdrop-blur-md transition hover:bg-panel"
      >
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
        </span>
        <Skull size={14} aria-hidden="true" />
        Your squad
        <span className="tabular-nums text-gold/70">
          {queuing.members.length}/{ZOMBIE_COOP_MAX_PLAYERS}
        </span>
      </button>

      {queueOpen && <ZombieLobbyView lobby={queuing} onClose={() => setQueueOpen(false)} />}
    </>
  );
}
