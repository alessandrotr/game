import { Swords, Users } from 'lucide-react';
import { findMyLobby, useLobbyStore } from '../store/useLobbyStore';
import { Button } from './primitives';
import { MatchmakingMenu } from './MatchmakingMenu';
import { LobbyView } from './LobbyView';
import { ReadyCheckOverlay } from './ReadyCheckOverlay';

/**
 * Town matchmaking entry point (Phase 12): a top-right button that opens the
 * lobby browser, plus the overlays it drives — the browser, a selected lobby's
 * team view, and the ready-check. Replaces the old one-shot "Find 1v1" queue.
 * Mounted town-only by the HUD; the lobby connection runs in parallel with the
 * town room, so the player keeps walking around while queued.
 */
export function Matchmaking() {
  const lobbies = useLobbyStore((s) => s.lobbies);
  const mySessionId = useLobbyStore((s) => s.mySessionId);
  const menuOpen = useLobbyStore((s) => s.menuOpen);
  const selectedLobbyId = useLobbyStore((s) => s.selectedLobbyId);
  const setMenuOpen = useLobbyStore((s) => s.setMenuOpen);

  const myLobby = findMyLobby(lobbies, mySessionId);
  // Your own lobby always wins over a browser preview selection.
  const viewLobby = myLobby ?? lobbies.find((l) => l.id === selectedLobbyId) ?? null;
  const isMember = !!myLobby && myLobby.id === viewLobby?.id;

  const filled = myLobby
    ? [...myLobby.blue, ...myLobby.red].filter((s) => s.sessionId !== '').length
    : 0;
  const capacity = myLobby ? myLobby.blue.length + myLobby.red.length : 0;

  return (
    <>
      <div className="pointer-events-none absolute right-4 top-16 flex justify-end">
        {myLobby ? (
          <Button
            variant="goldOutline"
            onClick={() => setMenuOpen(true)}
            className="pointer-events-auto gap-1.5 px-4 py-2.5"
          >
            <Users size={15} aria-hidden="true" />
            {myLobby.name} · {filled}/{capacity}
          </Button>
        ) : (
          <Button
            variant="gold"
            onClick={() => setMenuOpen(true)}
            className="pointer-events-auto gap-1.5 px-5 py-2.5 shadow-[0_6px_20px_rgba(200,162,74,0.25)]"
          >
            <Swords size={15} aria-hidden="true" />
            Play
          </Button>
        )}
      </div>

      {myLobby?.status === 'ready_check' ? (
        <ReadyCheckOverlay lobby={myLobby} />
      ) : (
        menuOpen &&
        (viewLobby ? <LobbyView lobby={viewLobby} isMember={isMember} /> : <MatchmakingMenu />)
      )}
    </>
  );
}
