/**
 * Data-driven class system. Class definitions are plain data (no logic), keyed
 * by `CharacterClass`, and reference abilities by id rather than embedding them.
 * Both client (selection UI, asset resolution) and server (future authoritative
 * per-class stats) read from here.
 *
 * Future extensibility: add a class by extending `CharacterClass` (in assets.ts)
 * and adding one entry to `CLASS_DEFINITIONS` — every consumer picks it up. Add a
 * stat by adding a field to `ClassStats` (and a default to each class).
 */

import type { CharacterClass } from './assets.js';
import type { AbilityKind } from './constants.js';

/** Base per-class stats. Authoritative gameplay can derive HP/mana/speed from these. */
export interface ClassStats {
  health: number;
  mana: number;
  /** Ground move speed (world units/second). */
  moveSpeed: number;
  /** Representative attack/ability power, for comparison in the UI. */
  attackDamage: number;
  /** Relative complexity, 1 (simple) to 3 (hard). UI only. */
  difficulty: 1 | 2 | 3;
}

/** Static, data-only definition of a playable class. */
export interface ClassDefinition {
  id: CharacterClass;
  name: string;
  /** Short role label, e.g. "Melee Bruiser". */
  role: string;
  description: string;
  stats: ClassStats;
  /** Abilities this class is themed around, referenced by id (not duplicated). */
  abilities: AbilityKind[];
  /** UI accent color (matches the placeholder character asset). */
  color: string;
}

export const CLASS_DEFINITIONS: Record<CharacterClass, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    role: 'Melee Bruiser',
    description: 'A durable frontliner who wades in and erupts with shockwaves.',
    stats: { health: 420, mana: 80, moveSpeed: 9, attackDamage: 45, difficulty: 1 },
    abilities: ['cleave', 'charge', 'shield_wall', 'ground_slam'],
    color: '#b94b4b',
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    role: 'Ranged Burst',
    description:
      'Glass-cannon caster: fireballs, a frost burst, arcane bolts, and a targeted blast.',
    stats: { health: 280, mana: 220, moveSpeed: 9, attackDamage: 55, difficulty: 3 },
    abilities: ['fireball', 'frost_nova', 'arcane_bolt', 'arcane_blast'],
    color: '#3a57d6',
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    role: 'Ranged Skirmisher',
    description: 'Mobile damage dealer who kites from a distance.',
    stats: { health: 360, mana: 100, moveSpeed: 9, attackDamage: 40, difficulty: 2 },
    abilities: ['power_shot', 'crippling_shot', 'tumble', 'pinning_arrow'],
    color: '#3f9d56',
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    role: 'Support Healer',
    description: 'Sustains allies with heals while contributing steady damage.',
    stats: { health: 340, mana: 180, moveSpeed: 9, attackDamage: 25, difficulty: 2 },
    abilities: ['smite', 'heal', 'renew', 'condemn'],
    color: '#e8c45a',
  },
};

export function getClassDefinition(characterClass: CharacterClass): ClassDefinition {
  return CLASS_DEFINITIONS[characterClass];
}

/** All class definitions in display order. */
export const CLASS_LIST: ClassDefinition[] = Object.values(CLASS_DEFINITIONS);
