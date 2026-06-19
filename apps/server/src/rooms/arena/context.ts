import type { ArenaObstacle } from '@arena/shared';
import type { ArenaState } from '../schema.js';
import type { AnimOneShot } from '../../animation.js';
import type { ArenaTuning } from './tuning.js';
import type { PerkModifiers } from './perks.js';

/** Forced motion (dash / knockback) that overrides locomotion until `until` (ms). */
export interface Displacement {
  vx: number;
  vz: number;
  until: number;
  /** Damaging dash: HP dealt to each enemy the mover ploughs through (once each). */
  damage?: number;
  /** Who gets the kill credit for that damage. */
  fromId?: string;
  /** Session ids already struck this dash (so each enemy is hit at most once). */
  hit?: Set<string>;
}

/**
 * The slice of the arena the combat / projectile / match systems operate on. The
 * room builds one of these from its own fields (the maps are shared **by
 * reference**, so a system mutating `respawnAt` is seen by the room's tick loop)
 * and the broadcast/clock closures. Centralizing the seam here keeps each system
 * decoupled from the full `ArenaRoom` while making the shared world explicit.
 */
export interface ArenaContext {
  readonly state: ArenaState;
  readonly tuning: ArenaTuning;
  /** This match's procedural cover — the authoritative collision set. */
  readonly obstacles: readonly ArenaObstacle[];
  /** Current simulation time in ms. */
  now(): number;
  /** Broadcast a server message to every client. */
  broadcast(type: string | number, message?: unknown): void;
  /** Send a server message to a single client (by session id). */
  send(sessionId: string, type: string | number, message?: unknown): void;
  /** Schedule a one-shot callback on the room clock. */
  setTimeout(handler: () => void, ms: number): void;
  /** Dispose the room. */
  disconnect(): void;

  // Per-session simulation state, shared by reference with the room's tick loop.
  readonly destinations: Map<string, { x: number; z: number }>;
  readonly animOneShots: Map<string, AnimOneShot>;
  readonly attackTargets: Map<string, string>;
  readonly respawnAt: Map<string, number>;
  readonly displacements: Map<string, Displacement>;
  /** Get the aggregate perk stat modifiers for a player (identity when no perk
   *  system is active). */
  perkModifiers(sessionId: string): PerkModifiers;
}
