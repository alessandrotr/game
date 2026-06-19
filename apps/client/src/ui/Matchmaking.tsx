import { useEffect } from 'react';
import { findMyLobby, useLobbyStore } from '../store/useLobbyStore';
import { useFocusStore } from '../store/useFocusStore';
import { MatchmakingMenu } from './MatchmakingMenu';
import { LobbyView } from './LobbyView';
import { ReadyCheckOverlay } from './ReadyCheckOverlay';

/**
 * Matchmaking overlays (Phase 12): the lobby browser, a selected lobby's team
 * view, and the ready-check. Entry is diegetic — opened from the town "Trial of
 * Blades" duel shrine (see scene/TownDuelAltar.tsx) via `useLobbyStore.setMenuOpen`;
 * there is no HUD button. Mounted town-only by the HUD; the lobby connection runs
 * in parallel with the town room, so the player keeps walking around while queued.
 * The ready-check pops automatically (independent of the menu) once the lobby fills.
 */
export function Matchmaking() {
  const lobbies = useLobbyStore((s) => s.lobbies);
  const mySessionId = useLobbyStore((s) => s.mySessionId);
  const menuOpen = useLobbyStore((s) => s.menuOpen);
  const selectedLobbyId = useLobbyStore((s) => s.selectedLobbyId);

  const myLobby = findMyLobby(lobbies, mySessionId);
  // Your own lobby always wins over a browser preview selection.
  const viewLobby = myLobby ?? lobbies.find((l) => l.id === selectedLobbyId) ?? null;
  const isMember = !!myLobby && myLobby.id === viewLobby?.id;

  // Cinematic focus belongs to the entry browser only. Once the player advances
  // into a lobby / ready-check (wider, interactive flows that want the centered
  // dimmed overlay) — or closes the menu — release the camera + movement lock.
  const showingMenu = menuOpen && !viewLobby && myLobby?.status !== 'ready_check';
  useEffect(() => {
    if (!showingMenu) useFocusStore.getState().clear('pvp');
  }, [showingMenu]);
  useEffect(() => () => useFocusStore.getState().clear('pvp'), []);

  return (
    <>
      {myLobby?.status === 'ready_check' ? (
        <ReadyCheckOverlay lobby={myLobby} />
      ) : (
        menuOpen &&
        (viewLobby ? <LobbyView lobby={viewLobby} isMember={isMember} /> : <MatchmakingMenu />)
      )}
    </>
  );
}
