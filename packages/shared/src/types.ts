/**
 * Plain, transport-agnostic shapes that mirror the authoritative Colyseus schema.
 * The client uses these to read replicated state with full type-safety without
 * depending on `@colyseus/schema` decorators at build time.
 */

import type { CharacterClass } from './assets.js';

/** Replicated per-player state. Mirrors `Player` in the server schema. */
export interface PlayerView {
  readonly sessionId: string;
  name: string;
  /** World position. */
  x: number;
  y: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  /** Playable class — drives which character asset the client renders. */
  characterClass: CharacterClass;
  /** Optional skin asset id applied on top of the class's base appearance. */
  skinId: string;
}

/** Replicated in-flight projectile. Mirrors `Projectile` in the server schema. */
export interface ProjectileView {
  readonly id: string;
  ownerId: string;
  /** Ability that spawned it (e.g. 'fireball'). */
  ability: string;
  x: number;
  y: number;
  z: number;
}

/** Replicated room state. Mirrors `ArenaState` in the server schema. */
export interface ArenaStateView {
  /** Keyed by Colyseus session id. */
  players: Map<string, PlayerView>;
  /** Keyed by projectile id. */
  projectiles: Map<string, ProjectileView>;
  /** Monotonically increasing server tick counter. */
  tick: number;
}
