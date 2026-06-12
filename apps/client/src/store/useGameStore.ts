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
  /** True while switching worlds (town↔arena): the UI shows a loading screen
   *  over the old scene until the new room is joined. */
  transitioning: boolean;
  /** Tagline shown on the transition loading screen. */
  transitionLabel: string;
  /** Server tick of the latest applied snapshot. */
  tick: number;
  /** Per-match procedural arena layout seed (0 until the arena state syncs it).
   *  Reactive so the scene rebuilds cover when a new arena is joined. */
  arenaSeed: number;

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
  /** Set the arena layout seed (no-op if unchanged). */
  setArenaSeed: (seed: number) => void;
  /** Toggle the world-swap loading screen (with an optional tagline). */
  setTransitioning: (transitioning: boolean, label?: string) => void;
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
  transitioning: false,
  transitionLabel: 'Loading the arena…',
  tick: 0,
  arenaSeed: 0,
  playerIds: [],
  projectileIds: [],
  players: new Map<string, PlayerView>(),
  projectiles: new Map<string, ProjectileView>(),

  setStatus: (status, error = null) => set({ status, error }),
  setSessionId: (sessionId) => set({ sessionId }),
  setRoom: (room) => set({ room }),
  setArenaSeed: (seed) => {
    if (get().arenaSeed !== seed) set({ arenaSeed: seed });
  },
  setTransitioning: (transitioning, label) =>
    set(label ? { transitioning, transitionLabel: label } : { transitioning }),

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
      transitioning: false,
      tick: 0,
      arenaSeed: 0,
      playerIds: [],
      projectileIds: [],
    });
  },
}));
