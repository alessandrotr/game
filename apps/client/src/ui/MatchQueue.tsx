import { useEffect } from 'react';
import { Swords } from 'lucide-react';
import { findMyLobby, useLobbyStore } from '../store/useLobbyStore';
import { LobbyView } from './LobbyView';

/**
 * The player's own match queue, as a MAIN-HUD element fully independent of the
 * matchmaking browser and the cinematic focus:
 *  - a notification-style button pinned top-right of the screen, shown whenever
 *    you're queued in a duel (in town, whether or not the shrine menu is open);
 *  - a standalone dialog (the lobby's team view) opened from it.
 * Opening/closing it never touches the matchmaking menu or the camera focus.
 */
export function MatchQueue() {
  const lobbies = useLobbyStore((s) => s.lobbies);
  const mySessionId = useLobbyStore((s) => s.mySessionId);
  const queueOpen = useLobbyStore((s) => s.queueOpen);
  const setQueueOpen = useLobbyStore((s) => s.setQueueOpen);

  const myLobby = findMyLobby(lobbies, mySessionId);
  // The ready-check has its own full-screen overlay; the button/dialog only apply
  // while still queuing.
  const queuing = myLobby?.status === 'queuing' ? myLobby : null;

  // Auto-close the dialog if you're no longer queued (left / match started).
  useEffect(() => {
    if (!queuing && queueOpen) setQueueOpen(false);
  }, [queuing, queueOpen, setQueueOpen]);

  if (!queuing) return null;

  const filled = [...queuing.blue, ...queuing.red].filter((s) => s.sessionId !== '').length;
  const capacity = queuing.blue.length + queuing.red.length;

  return (
    <>
      {/* Pinned top-right of the screen. Sits at modal level (and renders after the
          matchmaking overlay) so it stays clickable even during the cinematic focus,
          where the docked menu's full-screen overlay would otherwise capture it. */}
      <button
        type="button"
        onClick={() => setQueueOpen(true)}
        className="pointer-events-auto fixed right-4 top-4 z-modal flex items-center gap-2 rounded-xl border border-gold/50 bg-panel/80 px-3 py-2 text-sm font-semibold tracking-wide text-gold shadow-lg backdrop-blur-md transition hover:bg-panel"
      >
        {/* Pulsing notification dot — your queue is live. */}
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
        </span>
        <Swords size={14} aria-hidden="true" />
        Your match
        <span className="tabular-nums text-gold/70">
          {filled}/{capacity}
        </span>
      </button>

      {queueOpen && <LobbyView lobby={queuing} isMember onClose={() => setQueueOpen(false)} />}
    </>
  );
}
