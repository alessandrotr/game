import { create } from 'zustand';
import { structureFootprint } from '@arena/shared';
import type {
  ArenaObstacle,
  BarrelView,
  CoverStructureView,
  DestructibleView,
  GroundZoneView,
  PickableView,
  PlayerView,
  ProjectileView,
} from '@arena/shared';

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

  /** Zombie survival mode is active (drives the wave HUD). */
  zombieMode: boolean;
  /** Gun Mode Zombie is active — zombie survival with gun controls (WASD + mouse
   *  aim + right-click fire). Implies `zombieMode`. */
  gunMode: boolean;
  /** Which Gun Mode camera/control scheme is active: `'fps'` (first-person
   *  mouse-look) or `'topdown'` (the locked over-the-shoulder shooter cam).
   *  Toggled with V; a user preference, so it persists across rooms. */
  gunView: 'fps' | 'topdown';
  /** Co-op matchmade zombie run (death is final; drives the death/spectate flow). */
  coopZombie: boolean;
  /** Current zombie wave/level (0 before the first horde). */
  zombieLevel: number;
  /** Zombies left to defeat this level (alive + not-yet-spawned). */
  zombiesRemaining: number;
  /** Zombies currently alive in the arena. */
  zombiesAlive: number;
  /** How many sections beyond the main room are unlocked (0–3).
   *  Drives section rendering, minimap, and door barrier state. */
  unlockedSections: number;

  /**
   * Reactive lists of ids — change only when membership changes, so React
   * remounts meshes on join/leave (or projectile spawn/expire) but not on
   * every position update.
   */
  playerIds: string[];
  projectileIds: string[];
  /** Reactive list of live barrel ids — drives mounting/unmounting barrel meshes. */
  barrelIds: string[];
  /** Reactive list of destructible ids — drives mounting/unmounting their meshes. */
  destructibleIds: string[];
  /** Reactive list of cover-structure ids — drives mounting their meshes (stable
   *  for the match; structures crumble in place rather than being removed). */
  structureIds: string[];
  /** Reactive list of loose pickable ids — drives mounting their meshes. */
  pickableIds: string[];
  /** Reactive list of ground-zone ids (the molotov puddle) — drives mounting. */
  groundZoneIds: string[];
  /** Alive (un-crumbled) structures as collision circles, for local prediction.
   *  Recomputed only when a structure crumbles (rare) — not every tick. */
  structureObstacles: ArenaObstacle[];
  /** Internal: signature of the alive-structure set, gating `structureObstacles`
   *  rebuilds. Not for component use. */
  _structureSig: string;

  /**
   * Mutable, non-reactive snapshots. Updated in place every patch and read
   * imperatively inside `useFrame` to avoid per-frame React re-renders. Do not
   * subscribe to these in components.
   */
  readonly players: Map<string, PlayerView>;
  readonly projectiles: Map<string, ProjectileView>;
  readonly barrels: Map<string, BarrelView>;
  readonly destructibles: Map<string, DestructibleView>;
  readonly structures: Map<string, CoverStructureView>;
  readonly pickables: Map<string, PickableView>;
  readonly groundZones: Map<string, GroundZoneView>;

  setStatus: (status: ConnectionStatus, error?: string | null) => void;
  setSessionId: (sessionId: string | null) => void;
  setRoom: (room: RoomType | null) => void;
  /** Flip the Gun Mode camera between first-person and top-down. */
  toggleGunView: () => void;
  /** Set the arena layout seed (no-op if unchanged). */
  setArenaSeed: (seed: number) => void;
  /** Sync the replicated zombie-wave counters (no-op if all unchanged). */
  setZombie: (
    mode: boolean,
    gun: boolean,
    level: number,
    remaining: number,
    alive: number,
    coop: boolean,
    sections: number,
  ) => void;
  /** Toggle the world-swap loading screen (with an optional tagline). */
  setTransitioning: (transitioning: boolean, label?: string) => void;
  /** Replace snapshot contents and refresh id lists if membership changed. */
  applySnapshot: (
    players: Map<string, PlayerView>,
    projectiles: Map<string, ProjectileView>,
    barrels: Map<string, BarrelView>,
    destructibles: Map<string, DestructibleView>,
    structures: Map<string, CoverStructureView>,
    pickables: Map<string, PickableView>,
    groundZones: Map<string, GroundZoneView>,
    tick: number,
  ) => void;
  reset: () => void;
}

/** Signature of the alive-structure set + their positions (quarter-unit rounded):
 *  changes when one crumbles AND when a car rolls, so the local predictor's
 *  collision circles follow a moving car instead of sticking at its old spot. */
function aliveStructureSig(structures: Map<string, CoverStructureView>): string {
  let sig = '';
  for (const [id, s] of structures) {
    if (s.destroyed) continue;
    sig += `${id}:${Math.round(s.x * 4)}:${Math.round(s.z * 4)};`;
  }
  return sig;
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
  zombieMode: false,
  gunMode: false,
  gunView: 'fps',
  coopZombie: false,
  zombieLevel: 0,
  zombiesRemaining: 0,
  zombiesAlive: 0,
  unlockedSections: 0,
  playerIds: [],
  projectileIds: [],
  barrelIds: [],
  destructibleIds: [],
  structureIds: [],
  pickableIds: [],
  groundZoneIds: [],
  structureObstacles: [],
  players: new Map<string, PlayerView>(),
  projectiles: new Map<string, ProjectileView>(),
  barrels: new Map<string, BarrelView>(),
  destructibles: new Map<string, DestructibleView>(),
  structures: new Map<string, CoverStructureView>(),
  pickables: new Map<string, PickableView>(),
  groundZones: new Map<string, GroundZoneView>(),
  /** Signature of the last-applied alive-structure set (internal; gates rebuilds). */
  _structureSig: '',

  setStatus: (status, error = null) => set({ status, error }),
  setSessionId: (sessionId) => set({ sessionId }),
  setRoom: (room) => set({ room }),
  toggleGunView: () => set((s) => ({ gunView: s.gunView === 'fps' ? 'topdown' : 'fps' })),
  setArenaSeed: (seed) => {
    if (get().arenaSeed !== seed) set({ arenaSeed: seed });
  },
  setZombie: (mode, gun, level, remaining, alive, coop, sections) => {
    const s = get();
    if (
      s.zombieMode !== mode ||
      s.gunMode !== gun ||
      s.coopZombie !== coop ||
      s.zombieLevel !== level ||
      s.zombiesRemaining !== remaining ||
      s.zombiesAlive !== alive ||
      s.unlockedSections !== sections
    ) {
      set({
        zombieMode: mode,
        gunMode: gun,
        coopZombie: coop,
        zombieLevel: level,
        zombiesRemaining: remaining,
        zombiesAlive: alive,
        unlockedSections: sections,
      });
    }
  },
  setTransitioning: (transitioning, label) =>
    set(label ? { transitioning, transitionLabel: label } : { transitioning }),

  applySnapshot: (
    incomingPlayers,
    incomingProjectiles,
    incomingBarrels,
    incomingDestructibles,
    incomingStructures,
    incomingPickables,
    incomingGroundZones,
    tick,
  ) => {
    const {
      players,
      projectiles,
      barrels,
      destructibles,
      structures,
      pickables,
      groundZones,
      playerIds,
      projectileIds,
      barrelIds,
      destructibleIds,
      structureIds,
      pickableIds,
      groundZoneIds,
    } = get();

    players.clear();
    for (const [id, view] of incomingPlayers) players.set(id, view);
    projectiles.clear();
    for (const [id, view] of incomingProjectiles) projectiles.set(id, view);
    barrels.clear();
    for (const [id, view] of incomingBarrels) barrels.set(id, view);
    destructibles.clear();
    for (const [id, view] of incomingDestructibles) destructibles.set(id, view);
    structures.clear();
    for (const [id, view] of incomingStructures) structures.set(id, view);
    pickables.clear();
    for (const [id, view] of incomingPickables) pickables.set(id, view);
    groundZones.clear();
    for (const [id, view] of incomingGroundZones) groundZones.set(id, view);

    const nextPlayerIds = [...players.keys()].sort();
    const nextProjectileIds = [...projectiles.keys()].sort();
    const nextBarrelIds = [...barrels.keys()].sort();
    const nextDestructibleIds = [...destructibles.keys()].sort();
    const nextStructureIds = [...structures.keys()].sort();
    const nextPickableIds = [...pickables.keys()].sort();
    const nextGroundZoneIds = [...groundZones.keys()].sort();

    const patch: Partial<GameStore> = { tick };
    if (!sameMembership(playerIds, nextPlayerIds)) patch.playerIds = nextPlayerIds;
    if (!sameMembership(projectileIds, nextProjectileIds)) patch.projectileIds = nextProjectileIds;
    if (!sameMembership(barrelIds, nextBarrelIds)) patch.barrelIds = nextBarrelIds;
    if (!sameMembership(destructibleIds, nextDestructibleIds)) patch.destructibleIds = nextDestructibleIds;
    if (!sameMembership(structureIds, nextStructureIds)) patch.structureIds = nextStructureIds;
    if (!sameMembership(pickableIds, nextPickableIds)) patch.pickableIds = nextPickableIds;
    if (!sameMembership(groundZoneIds, nextGroundZoneIds)) patch.groundZoneIds = nextGroundZoneIds;
    // Rebuild the prediction collision circles only when a structure crumbles.
    const sig = aliveStructureSig(structures);
    if (sig !== get()._structureSig) {
      patch._structureSig = sig;
      // Same footprint helper the server collides against (a length-fitted capsule
      // for trailers, a circle otherwise), so prediction matches authority exactly.
      patch.structureObstacles = [...structures.values()]
        .filter((s) => !s.destroyed)
        .flatMap((s) =>
          structureFootprint(s.assetId, s.x, s.z, s.rotation, s.radius, s.height, s.lengthScale),
        );
    }
    set(patch);
  },

  reset: () => {
    get().players.clear();
    get().projectiles.clear();
    get().barrels.clear();
    get().destructibles.clear();
    get().structures.clear();
    get().pickables.clear();
    get().groundZones.clear();
    set({
      status: 'idle',
      error: null,
      sessionId: null,
      room: null,
      transitioning: false,
      tick: 0,
      arenaSeed: 0,
      zombieMode: false,
      gunMode: false,
      coopZombie: false,
      zombieLevel: 0,
      zombiesRemaining: 0,
      zombiesAlive: 0,
      unlockedSections: 0,
      playerIds: [],
      projectileIds: [],
      barrelIds: [],
      destructibleIds: [],
      structureIds: [],
      pickableIds: [],
      groundZoneIds: [],
      structureObstacles: [],
      _structureSig: '',
    });
  },
}));
