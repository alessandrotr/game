import { Skull } from 'lucide-react';
import { findMyZombieLobby, useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { useHudStore } from '../store/useHudStore';
import { Button } from './primitives';
import { HudZone } from './hud/HudLayout';
import { ZombieMatchmakingMenu } from './ZombieMatchmakingMenu';
import { ZombieLobbyView } from './ZombieLobbyView';

/**
 * Town co-op Zombie matchmaking entry point: a top-right trigger (below the PvP
 * "Play" button) that opens the squad browser, plus the overlays it drives — the
 * browser and, once you're in a squad, the squad detail with the host's Start
 * control. Mounted town-only; the zombie lobby connection runs in parallel with
 * the town room (see `connectZombieMatchmaking`).
 */
export function ZombieMatchmaking() {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const mySessionId = useZombieLobbyStore((s) => s.mySessionId);
  const menuOpen = useZombieLobbyStore((s) => s.menuOpen);
  const setMenuOpen = useZombieLobbyStore((s) => s.setMenuOpen);
  const hidden = useHudStore((s) => s.hidden);

  const myLobby = findMyZombieLobby(lobbies, mySessionId);

  return (
    <>
      {/* Sits below the PvP Play button in the same top-right column. */}
      {!hidden && (
        <HudZone zone="top-right" className="top-28">
          {myLobby ? (
            <Button
              variant="goldOutline"
              onClick={() => setMenuOpen(true)}
              className="pointer-events-auto gap-1.5 px-4 py-2.5"
            >
              <Skull size={15} aria-hidden="true" />
              {myLobby.name} · {myLobby.members.length}
            </Button>
          ) : (
            <Button
              variant="panel"
              onClick={() => setMenuOpen(true)}
              className="pointer-events-auto gap-1.5 px-5 py-2.5"
            >
              <Skull size={15} aria-hidden="true" />
              Zombie Co-op
            </Button>
          )}
        </HudZone>
      )}

      {menuOpen &&
        (myLobby ? <ZombieLobbyView lobby={myLobby} /> : <ZombieMatchmakingMenu />)}
    </>
  );
}
