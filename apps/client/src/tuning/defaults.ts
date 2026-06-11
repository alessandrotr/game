/**
 * Gameplay Tuning Registry — the single source of truth for tunable gameplay
 * values. This module is production-safe: it has **no Leva dependency**, so the
 * defaults always ship and systems read them whether or not dev tools exist.
 *
 * The dev-only Leva layer (`../devtools`) writes edited values back into the
 * store that wraps these defaults. Gameplay systems only ever read the store.
 *
 * Future-proofing: add a field to a section (or a new section / ability) here
 * and it automatically has a default and a typed home. Add a control for it in
 * `../devtools/tuningModules.ts` to expose it in the panel.
 */

/** Player movement (point-and-click). */
export interface PlayerTuning {
  walkSpeed: number;
  sprintSpeed: number;
  jumpForce: number;
  /** Turn rate toward movement direction for mouse-move (1/second). */
  rotationSpeed: number;
  /** How close to the mouse-move target counts as arrived (world units). */
  stoppingDistance: number;
  /** Cursor distance beyond which hold-to-move sprints (world units). */
  sprintThreshold: number;
}

export interface CombatTuning {
  baseDamage: number;
  /** Mana restored per second. */
  manaRegen: number;
  /** Global multiplier applied to every ability cooldown. */
  cooldownMultiplier: number;
}

export interface ArenaTuning {
  /** Match length in seconds. */
  matchDuration: number;
  /** Delay before a defeated player respawns, in seconds. */
  respawnDelay: number;
}

export interface CameraTuning {
  /** Horizontal/back distance from the player. */
  distance: number;
  /** Height above the player. */
  height: number;
  /** Follow stiffness (1/second); higher = tighter. */
  followSmoothing: number;
}

/**
 * Per-ability tuning. Fields are optional so each ability fills only what it
 * uses. These mirror the server's `AbilityConfig` (see
 * `useServerAbilityTuning`), with time in **seconds** for friendlier knobs.
 */
export interface AbilityTuning {
  damage?: number;
  /** Seconds. */
  cooldown: number;
  /** Mana spent per cast. */
  manaCost?: number;
  /** Wind-up before the effect resolves, in seconds. */
  castTime?: number;
  projectileSpeed?: number;
  /** Teleport/strike reach (maps to the server's `range`). */
  distance?: number;
  /** Area-of-effect radius (frost nova, meteor). */
  aoeRadius?: number;
  /** Heal amount (heal abilities). */
  amount?: number;
}

export type AbilityId =
  | 'fireball'
  | 'heal'
  | 'frost_nova'
  | 'shockwave'
  | 'arcane_bolt'
  | 'arcane_blast';
export type AbilitiesTuning = Record<AbilityId, AbilityTuning>;

/** Simple AI knobs (consumed once AI exists). */
export interface AiTuning {
  aggroRadius: number;
  /** Seconds before an alerted enemy reacts. */
  reactionTime: number;
  wanderSpeed: number;
}

export interface Tuning {
  player: PlayerTuning;
  combat: CombatTuning;
  arena: ArenaTuning;
  camera: CameraTuning;
  abilities: AbilitiesTuning;
  ai: AiTuning;
}

/** Flat (non-nested) tuning sections — drive the generic tuning panel. */
export type FlatSection = 'player' | 'combat' | 'arena' | 'camera' | 'ai';

export const defaultTuning: Tuning = {
  player: {
    walkSpeed: 6,
    sprintSpeed: 9,
    jumpForce: 8.5,
    rotationSpeed: 10,
    stoppingDistance: 0.1,
    sprintThreshold: 1.5,
  },
  combat: {
    baseDamage: 20,
    manaRegen: 5,
    cooldownMultiplier: 1,
  },
  arena: {
    matchDuration: 300,
    respawnDelay: 5,
  },
  camera: {
    distance: 13.5,
    height: 15.8,
    followSmoothing: 30,
  },
  abilities: {
    fireball: { damage: 30, cooldown: 1.5, manaCost: 20, projectileSpeed: 18 },
    heal: { amount: 40, cooldown: 10, manaCost: 40, castTime: 0.6 },
    frost_nova: { damage: 22, cooldown: 5, manaCost: 30, aoeRadius: 5 },
    shockwave: { damage: 24, cooldown: 6, manaCost: 25, aoeRadius: 5 },
    arcane_bolt: { damage: 24, cooldown: 3, manaCost: 22, projectileSpeed: 26 },
    arcane_blast: { damage: 55, cooldown: 9, manaCost: 50, distance: 16, aoeRadius: 4 },
  },
  ai: {
    aggroRadius: 12,
    reactionTime: 0.4,
    wanderSpeed: 2,
  },
};
