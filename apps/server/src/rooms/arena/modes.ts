import {
  ARENA_HALF_SIZE,
  ARENA_HALF_Z,
  ZOMBIE_MANA_REGEN_MULT,
  ZOMBIE_MODE,
  ZOMBIE_ROOM_HALF_SIZE,
  isLobbyMode,
} from '@arena/shared';

/**
 * A GAME MODE describes how one arena variant differs from the shared sim. The
 * arena room runs ONE simulation (combat, movement, projectiles, physics) and
 * reads its per-mode differences from this object instead of branching on
 * `this.zombieMode`/`this.gunMode` flags scattered through the file.
 *
 * Slice 1 carries the simple CONFIG VALUES (bounds, auto-attack, mana regen,
 * walk speed) plus capability flags; later slices fold the behavioural branches
 * (tick hooks, death policy, which systems/handlers to build) in here too. Adding
 * a new mode then becomes: add one object below + map it in `resolveGameMode`.
 */
export interface GameMode {
  readonly id: string;
  /** Horde survival (zombies, room expansion, forced auto-attack). */
  readonly zombie: boolean;
  /** Fight with guns instead of the ability kit (implies `zombie`). */
  readonly gun: boolean;
  /** Play-area half-extents. FFA/ranked are a longer north/south rectangle;
   *  zombie is square (it grows via the room-expansion system instead). */
  readonly bounds: { readonly halfX: number; readonly halfZ: number };
  /** Force auto-attack on for the whole room (zombie AI chases + strikes). */
  readonly autoAttack: boolean;
  /** Mana-regen multiplier (zombie survival regenerates faster). */
  readonly manaRegenMult: number;
  /** Walk-speed penalty subtracted from the class base — 0 in gun mode (faster). */
  readonly walkSpeedPenalty: number;
  /** Dead players respawn (PvP + drop-in survival). Co-op death is final. */
  readonly respawns: boolean;
  /** Players can issue a manual attack-target order (PvP). Off in survival —
   *  humans fight the horde with abilities/guns, not by targeting. */
  readonly manualAttack: boolean;
  /** Capability flags. */
  readonly usesPerks: boolean;
  readonly usesGuns: boolean;
  readonly usesChest: boolean;
  readonly roomExpansion: boolean;
}

/** What happens to a player/bot when it dies, decided by the mode. The room
 *  executes the result (the zombie-specific drops/trap-charge stay in the room). */
export type DeathPolicy = 'respawn' | 'remove' | 'linger';
export function deathPolicy(mode: GameMode, isBot: boolean): DeathPolicy {
  if (mode.zombie && isBot) return 'remove'; // a slain zombie vanishes immediately
  if (!mode.respawns) return 'linger'; // co-op: death is final (spectate / quit)
  return 'respawn';
}

const RECT = { halfX: ARENA_HALF_SIZE, halfZ: ARENA_HALF_Z } as const;
const SQUARE = { halfX: ZOMBIE_ROOM_HALF_SIZE, halfZ: ZOMBIE_ROOM_HALF_SIZE } as const;

/** Public free-for-all PvP (the portal arena). */
export const FFA_MODE: GameMode = {
  id: 'ffa',
  zombie: false,
  gun: false,
  bounds: RECT,
  autoAttack: false,
  manaRegenMult: 1,
  walkSpeedPenalty: 1,
  respawns: true,
  manualAttack: true,
  usesPerks: true,
  usesGuns: false,
  usesChest: true,
  roomExpansion: false,
};

/** Matchmade ranked PvP (1v1…5v5). Same sim as FFA; differs in seating/scoring. */
export const RANKED_MODE: GameMode = { ...FFA_MODE, id: 'ranked' };

/** Public drop-in zombie survival (ability kit). Death respawns. */
export const ZOMBIE_SURVIVAL_MODE: GameMode = {
  id: 'zombie',
  zombie: true,
  gun: false,
  bounds: SQUARE,
  autoAttack: true,
  manaRegenMult: ZOMBIE_MANA_REGEN_MULT,
  walkSpeedPenalty: 1,
  respawns: true,
  manualAttack: false,
  usesPerks: true,
  usesGuns: false,
  usesChest: false,
  roomExpansion: true,
};

/** Matchmade co-op squad survival: death is final and the run ends when all fall. */
export const ZOMBIE_COOP_MODE: GameMode = {
  ...ZOMBIE_SURVIVAL_MODE,
  id: 'zombieCoop',
  respawns: false,
};

/** Gun-mode zombie survival: the same horde sim, fought with guns (no abilities). */
export const GUN_ZOMBIE_MODE: GameMode = {
  ...ZOMBIE_SURVIVAL_MODE,
  id: 'gunZombie',
  gun: true,
  walkSpeedPenalty: 0,
  usesPerks: false,
  usesGuns: true,
};

/** Map a room's `onCreate` options to its game mode. */
export function resolveGameMode(options?: { mode?: string; gun?: boolean; coop?: boolean }): GameMode {
  if (options?.mode === ZOMBIE_MODE) {
    if (options?.gun) return GUN_ZOMBIE_MODE;
    if (options?.coop) return ZOMBIE_COOP_MODE;
    return ZOMBIE_SURVIVAL_MODE;
  }
  if (isLobbyMode(options?.mode)) return RANKED_MODE;
  return FFA_MODE;
}
