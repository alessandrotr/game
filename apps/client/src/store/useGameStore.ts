import { create } from 'zustand';
import type { PlayerView, ProjectileView } from '@arena/shared';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** Which world the local player is currently in. */
export type RoomType = 'town' | 'arena';

interface GameStore {
  status: ConnectionStatus;
  error: string | null;
  /** This client's Colyseus session id, set once connected. */
  sessionId: string | null;
  /** The world the client is currently connected to (town hub or arena). */
  room: RoomType | null;
  /** Server tick of the latest applied snapshot. */
  tick: number;

  /**
   * Reactive lists of ids — change only when membership changes, so React
   * remounts meshes on join/leave (or projectile spawn/expire) but not on
   * every position update.
   */
  playerIds: string[];
  projectileIds: string[];

  /**
   * Mutable, non-reactive snapshots. Updated in place every patch and read
   * imperatively inside `useFrame` to avoid per-frame React re-renders. Do not
   * subscribe to these in components.
   */
  readonly players: Map<string, PlayerView>;
  readonly projectiles: Map<string, ProjectileView>;

  setStatus: (status: ConnectionStatus, error?: string | null) => void;
  setSessionId: (sessionId: string | null) => void;
  setRoom: (room: RoomType | null) => void;
  /** Replace snapshot contents and refresh id lists if membership changed. */
  applySnapshot: (
    players: Map<string, PlayerView>,
    projectiles: Map<string, ProjectileView>,
    tick: number,
  ) => void;
  reset: () => void;
}

function sameMembership(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const useGameStore = create<GameStore>((set, get) => ({
  status: 'idle',
  error: null,
  sessionId: null,
  room: null,
  tick: 0,
  playerIds: [],
  projectileIds: [],
  players: new Map<string, PlayerView>(),
  projectiles: new Map<string, ProjectileView>(),

  setStatus: (status, error = null) => set({ status, error }),
  setSessionId: (sessionId) => set({ sessionId }),
  setRoom: (room) => set({ room }),

  applySnapshot: (incomingPlayers, incomingProjectiles, tick) => {
    const { players, projectiles, playerIds, projectileIds } = get();

    players.clear();
    for (const [id, view] of incomingPlayers) players.set(id, view);
    projectiles.clear();
    for (const [id, view] of incomingProjectiles) projectiles.set(id, view);

    const nextPlayerIds = [...players.keys()].sort();
    const nextProjectileIds = [...projectiles.keys()].sort();

    const patch: Partial<GameStore> = { tick };
    if (!sameMembership(playerIds, nextPlayerIds)) patch.playerIds = nextPlayerIds;
    if (!sameMembership(projectileIds, nextProjectileIds)) patch.projectileIds = nextProjectileIds;
    set(patch);
  },

  reset: () => {
    get().players.clear();
    get().projectiles.clear();
    set({
      status: 'idle',
      error: null,
      sessionId: null,
      room: null,
      tick: 0,
      playerIds: [],
      projectileIds: [],
    });
  },
}));
