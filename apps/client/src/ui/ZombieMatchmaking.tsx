import { useEffect } from 'react';
import { findMyZombieLobby, useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { useFocusStore } from '../store/useFocusStore';
import { ZombieMatchmakingMenu } from './ZombieMatchmakingMenu';

/**
 * Co-op Zombie matchmaking: the squad browser. Entry is diegetic — opened from the
 * town "The Breach" shrine via `useZombieLobbyStore.setMenuOpen`. The browser stays
 * primary even while you're in a squad; your squad is managed from the standalone
 * queue dialog (a main-HUD element — see ZombieMatchQueue). Mounted town-only; the
 * zombie lobby connection runs in parallel with the town room.
 */
export function ZombieMatchmaking() {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const mySessionId = useZombieLobbyStore((s) => s.mySessionId);
  const menuOpen = useZombieLobbyStore((s) => s.menuOpen);

  const myLobby = findMyZombieLobby(lobbies, mySessionId);

  // Focus stays for the whole browsing session; only closing the menu releases it.
  useEffect(() => {
    if (!menuOpen) useFocusStore.getState().clear('coop');
  }, [menuOpen]);
  useEffect(() => () => useFocusStore.getState().clear('coop'), []);

  if (!menuOpen) return null;
  return <ZombieMatchmakingMenu myLobby={myLobby} />;
}
