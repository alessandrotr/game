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
  const setSelectedLobbyId = useLobbyStore((s) => s.setSelectedLobbyId);

  const myLobby = findMyLobby(lobbies, mySessionId);
  // The detail panel shows whichever lobby is explicitly selected — a browser
  // inspect (to pick a slot) OR your own match, opened from the menu's "Your
  // match" button. Membership no longer hijacks the browser: you keep browsing
  // and pop your match panel on demand.
  const detailLobby = lobbies.find((l) => l.id === selectedLobbyId) ?? null;
  const isMember = !!myLobby && myLobby.id === detailLobby?.id;

  // Keep the cinematic focus for the whole browsing session — including while a
  // lobby detail panel is layered over it (viewing/joining another's match). Only
  // the ready-check (a takeover flow) or closing the menu releases the camera.
  const showingMenu = menuOpen && myLobby?.status !== 'ready_check';
  useEffect(() => {
    if (!showingMenu) useFocusStore.getState().clear('pvp');
  }, [showingMenu]);
  useEffect(() => () => useFocusStore.getState().clear('pvp'), []);

  if (myLobby?.status === 'ready_check') return <ReadyCheckOverlay lobby={myLobby} />;
  if (!menuOpen) return null;
  return (
    <>
      <MatchmakingMenu myLobby={myLobby} />
      {detailLobby && (
        <LobbyView
          lobby={detailLobby}
          isMember={isMember}
          onClose={() => setSelectedLobbyId(null)}
        />
      )}
    </>
  );
}
