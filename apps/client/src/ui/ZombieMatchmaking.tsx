import { findMyZombieLobby, useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { ZombieMatchmakingMenu } from './ZombieMatchmakingMenu';
import { ZombieLobbyView } from './ZombieLobbyView';

/**
 * Co-op Zombie matchmaking overlays: the squad browser and, once you're in a
 * squad, the squad detail with the host's Start control. Entry is diegetic —
 * opened from the town "The Breach" shrine (see scene/TownBreachRift.tsx) via
 * `useZombieLobbyStore.setMenuOpen`; there is no HUD button. Mounted town-only;
 * the zombie lobby connection runs in parallel with the town room (see
 * `connectZombieMatchmaking`).
 */
export function ZombieMatchmaking() {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const mySessionId = useZombieLobbyStore((s) => s.mySessionId);
  const menuOpen = useZombieLobbyStore((s) => s.menuOpen);

  const myLobby = findMyZombieLobby(lobbies, mySessionId);

  return (
    <>{menuOpen && (myLobby ? <ZombieLobbyView lobby={myLobby} /> : <ZombieMatchmakingMenu />)}</>
  );
}
