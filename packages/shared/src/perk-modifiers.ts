/**
 * Perk stat modifiers — the single source of truth for what every zombie-mode
 * perk *does*, as data.
 *
 * Each {@link PerkDef} in `perks.ts` carries a `modifiers` patch (the per-perk
 * deltas); {@link computePerkModifiers} folds a player's active perks into one
 * aggregate {@link PerkModifiers} struct using a fixed per-field combine rule
 * ({@link MODIFIER_COMBINE}). The server (PerkSystem) and the client (cooldown
 * mirror, aim indicator, cast VFX) all call this same fold, so a magnitude lives
 * in exactly one place and can never drift between sides.
 *
 * To add/rebalance a perk effect: edit the perk's `modifiers` in `perks.ts`. To
 * add a brand-new *kind* of effect: add a field here (interface + identity +
 * combine rule) and a consumer in the combat/tick loop.
 */

import { PERKS, type PerkId } from './perks.js';

/** The computed stat modifiers from a player's active perks. Every field
 *  defaults to the identity (1 for multipliers, 0 for flat adds, false for
 *  flags). */
export interface PerkModifiers {
  /** Multiplicative max-HP scale (e.g. 1.15 = +15%). */
  maxHpMult: number;
  /** Multiplicative damage-taken scale (e.g. 0.9 = −10%). */
  damageTakenMult: number;
  /** Flat move-speed bonus (world units/s, additive). */
  moveSpeedBonus: number;
  /** Multiplicative mana-regen scale. */
  manaRegenMult: number;
  /** Multiplicative ability-cooldown scale (e.g. 0.85 = −15%). */
  cooldownMult: number;
  /** Multiplicative ability-damage scale. */
  abilityDamageMult: number;
  /** Multiplicative mana-cost scale. */
  manaCostMult: number;
  /** Flat AoE-radius bonus (world units, additive). */
  aoeSizeBonus: number;
  /** Multiplicative AoE-damage bonus (stacks with abilityDamageMult). */
  aoeDamageMult: number;
  /** Flat damage reflected to melee attackers. */
  reflectDamage: number;
  /** True if the player is immune to stun. */
  stunImmune: boolean;
  /** Mana refunded per zombie kill (flat). */
  manaPerKill: number;
  /** Overclock: kills required within the window to reset all cooldowns. */
  overclockKillThreshold: number;
  /** AoE kill chain-explosion chance (0–1). */
  chainExplosionChance: number;
  /** Colossus damaging aura DPS (0 = no aura). */
  auraDps: number;
  /** Ability burn DoT: damage per tick (0 = disabled). */
  abilityBurnDamage: number;
  /** Ability burn DoT: total duration (ms). */
  abilityBurnDurationMs: number;
  /** Static shock: activation chance on ability hit (0-1). */
  lightningChance: number;
  /** Static shock: flat damage dealt. */
  lightningDamage: number;
  /** Static shock: maximum number of targets to chain to. */
  lightningTargets: number;
  /** Static shock: stun duration (ms) applied. */
  lightningStunMs: number;
  /** Adrenaline: ability damage multiplier when below 40% HP. */
  lowHpDamageMult: number;
  /** Adrenaline: move speed multiplier when below 40% HP. */
  lowHpSpeedMult: number;
  /** Adrenaline: flat move speed bonus when below 40% HP. */
  lowHpSpeedBonus: number;
  /** Adrenaline: stun immunity when below 40% HP. */
  lowHpStunImmune: boolean;
  /** Dodge chance: probability (0-1) of avoiding a zombie melee hit. */
  dodgeChance: number;
  /** Critical hit chance: probability (0-1) of a critical hit. */
  critChance: number;
  /** Critical hit damage multiplier (e.g. 1.5 = +50% damage). */
  critMultiplier: number;
  /** Critical hit cooldown reset chance: probability (0-1) on crit. */
  critCooldownResetChance: number;
  /** Poison: duration of poison status effect (ms). */
  poisonDurationMs: number;
  /** Poison: damage dealt per second. */
  poisonDamagePerSecond: number;
  /** Poison: spreading radius (0 = single target). */
  poisonSpreadRadius: number;
}

export const IDENTITY_MODIFIERS: PerkModifiers = {
  maxHpMult: 1,
  damageTakenMult: 1,
  moveSpeedBonus: 0,
  manaRegenMult: 1,
  cooldownMult: 1,
  abilityDamageMult: 1,
  manaCostMult: 1,
  aoeSizeBonus: 0,
  aoeDamageMult: 1,
  reflectDamage: 0,
  stunImmune: false,
  manaPerKill: 0,
  overclockKillThreshold: 0,
  chainExplosionChance: 0,
  auraDps: 0,
  abilityBurnDamage: 0,
  abilityBurnDurationMs: 0,
  lightningChance: 0,
  lightningDamage: 0,
  lightningTargets: 0,
  lightningStunMs: 0,
  lowHpDamageMult: 1,
  lowHpSpeedMult: 1,
  lowHpSpeedBonus: 0,
  lowHpStunImmune: false,
  dodgeChance: 0,
  critChance: 0,
  critMultiplier: 1.5,
  critCooldownResetChance: 0,
  poisonDurationMs: 0,
  poisonDamagePerSecond: 0,
  poisonSpreadRadius: 0,
};

/** How each field combines when multiple active perks contribute to it:
 *  - `mult`  → multiply onto the identity (e.g. two −% damage-taken sources stack
 *    multiplicatively across different chains).
 *  - `add`   → sum flat bonuses.
 *  - `or`    → logical OR for boolean flags.
 *  - `set`   → take the perk's value (chain-local fields: only one tier of one
 *    chain is ever active, so there is never a real conflict).
 */
export const MODIFIER_COMBINE: Record<keyof PerkModifiers, 'mult' | 'add' | 'or' | 'set'> = {
  maxHpMult: 'mult',
  damageTakenMult: 'mult',
  manaRegenMult: 'mult',
  cooldownMult: 'mult',
  abilityDamageMult: 'mult',
  manaCostMult: 'mult',
  aoeDamageMult: 'mult',
  moveSpeedBonus: 'add',
  aoeSizeBonus: 'add',
  stunImmune: 'or',
  lowHpStunImmune: 'or',
  reflectDamage: 'set',
  manaPerKill: 'set',
  overclockKillThreshold: 'set',
  chainExplosionChance: 'set',
  auraDps: 'set',
  abilityBurnDamage: 'set',
  abilityBurnDurationMs: 'set',
  lightningChance: 'set',
  lightningDamage: 'set',
  lightningTargets: 'set',
  lightningStunMs: 'set',
  lowHpDamageMult: 'set',
  lowHpSpeedMult: 'set',
  lowHpSpeedBonus: 'set',
  dodgeChance: 'set',
  critChance: 'set',
  critMultiplier: 'set',
  critCooldownResetChance: 'set',
  poisonDurationMs: 'set',
  poisonDamagePerSecond: 'set',
  poisonSpreadRadius: 'set',
};

/** Fold a player's active perks into one aggregate modifier struct. Pure: the
 *  same input always yields the same output, so it's safe to call on both sides
 *  of the wire and inside render loops (the result is small and cheap). */
export function computePerkModifiers(perkIds: readonly PerkId[]): PerkModifiers {
  const m: PerkModifiers = { ...IDENTITY_MODIFIERS };
  for (const id of perkIds) {
    const mod = PERKS[id]?.modifiers;
    if (!mod) continue;
    for (const key of Object.keys(mod) as (keyof PerkModifiers)[]) {
      const v = mod[key];
      if (v === undefined) continue;
      switch (MODIFIER_COMBINE[key]) {
        case 'mult':
          (m[key] as number) *= v as number;
          break;
        case 'add':
          (m[key] as number) += v as number;
          break;
        case 'or':
          (m[key] as boolean) = (m[key] as boolean) || (v as boolean);
          break;
        case 'set':
          (m[key] as number | boolean) = v;
          break;
      }
    }
  }
  return m;
}
