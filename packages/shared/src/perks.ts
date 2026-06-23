/**
 * Zombie-mode perk progression system — pure data catalog.
 *
 * Nine upgrade chains, three tiers each (Common → Rare → Legendary). A player
 * holds at most {@link PERK_MAX_SLOTS} perks; picks start at wave
 * {@link PERK_FIRST_WAVE}, rare upgrades at {@link PERK_RARE_WAVE}, legendary
 * upgrades at {@link PERK_LEGENDARY_WAVE}. Perks reset every run.
 *
 * Both the server (PerkSystem) and the client (PerkPicker / PerkBar) import
 * this; no runtime logic lives here.
 */

// ---------------------------------------------------------------------------
// Milestone constants
// ---------------------------------------------------------------------------

/** First wave that offers a perk pick (after clearing this wave). */
export const PERK_FIRST_WAVE = 3;
/** Wave from which common → rare upgrades are offered. */
export const PERK_RARE_WAVE = 6;
/** Wave from which rare → legendary upgrades are offered. */
export const PERK_LEGENDARY_WAVE = 9;
/** Maximum perks a player can hold at once. */
export const PERK_MAX_SLOTS = 3;
/** Auto-pick fallback (ms): if a player hasn't picked within this window the
 *  server picks the jolly (slot 3) for them so they don't block the squad. */
export const PERK_AUTOPICK_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { PerkModifiers } from './perk-modifiers.js';

export type PerkTier = 'common' | 'rare' | 'legendary';

/** All 30 perk ids, as a literal union. */
export type PerkId =
  // Chain 1 — Durability
  | 'thick_skin' | 'fortified' | 'unstoppable'
  // Chain 2 — Speed
  | 'swift_feet' | 'wind_runner' | 'phantom'
  // Chain 3 — Mana
  | 'mana_well' | 'arcane_reservoir' | 'infinite_power'
  // Chain 4 — Cooldowns
  | 'quick_hands' | 'rapid_fire' | 'overclock'
  // Chain 5 — Toughness
  | 'iron_will' | 'stoneskin' | 'colossus'
  // Chain 6 — Static Shock
  | 'static_shock' | 'overcharge' | 'thunderstorm'
  // Chain 7 — Ability Power
  | 'focused_mind' | 'spell_surge' | 'archmage'
  // Chain 8 — Adrenaline
  | 'adrenaline' | 'frenzy' | 'last_stand'
  // Chain 9 — AoE
  | 'wide_reach' | 'blast_master' | 'cataclysm'
  // Chain 10 — Precision
  | 'keen_eye' | 'sharpshooter' | 'deadeye'
  // Chain 11 — Poison
  | 'poison_touch' | 'toxic_spores' | 'plague';

/** A single perk definition. */
export interface PerkDef {
  id: PerkId;
  name: string;
  /** Lucide icon name (resolved by the client). */
  icon: string;
  tier: PerkTier;
  description: string;
  /** Index of the upgrade chain this perk belongs to (0–8). */
  chain: number;
  /** The next tier's perk in the same chain (undefined at legendary). */
  upgradesTo?: PerkId;
  /** The previous tier's perk in the same chain (undefined at common). */
  upgradesFrom?: PerkId;
  /** The stat deltas this perk contributes, folded by `computePerkModifiers`.
   *  This is the single source of truth for the perk's mechanical effect — the
   *  `description` above is the human-readable mirror of it. */
  modifiers: Partial<PerkModifiers>;
}

/** A three-tier upgrade chain: common → rare → legendary. */
export interface PerkChain {
  common: PerkId;
  rare: PerkId;
  legendary: PerkId;
}

// ---------------------------------------------------------------------------
// Upgrade chains (the 9 progression paths)
// ---------------------------------------------------------------------------

export const PERK_CHAINS: readonly PerkChain[] = [
  /* 0 */ { common: 'thick_skin',      rare: 'fortified',        legendary: 'unstoppable' },
  /* 1 */ { common: 'swift_feet',      rare: 'wind_runner',      legendary: 'phantom' },
  /* 2 */ { common: 'mana_well',       rare: 'arcane_reservoir', legendary: 'infinite_power' },
  /* 3 */ { common: 'quick_hands',     rare: 'rapid_fire',       legendary: 'overclock' },
  /* 4 */ { common: 'iron_will',       rare: 'stoneskin',        legendary: 'colossus' },
  /* 5 */ { common: 'static_shock',     rare: 'overcharge',       legendary: 'thunderstorm' },
  /* 6 */ { common: 'focused_mind',    rare: 'spell_surge',      legendary: 'archmage' },
  /* 7 */ { common: 'adrenaline',      rare: 'frenzy',           legendary: 'last_stand' },
  /* 8 */ { common: 'wide_reach',      rare: 'blast_master',     legendary: 'cataclysm' },
  /* 9 */ { common: 'keen_eye',        rare: 'sharpshooter',     legendary: 'deadeye' },
  /* 10 */ { common: 'poison_touch',    rare: 'toxic_spores',     legendary: 'plague' },
];

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export const PERKS: Record<PerkId, PerkDef> = {
  // ── Chain 0: Durability ──────────────────────────────────────────────────
  thick_skin: {
    id: 'thick_skin', name: 'Thick Skin', icon: 'Heart', tier: 'common', chain: 0,
    description: '+15% max HP',
    upgradesTo: 'fortified',
    modifiers: { maxHpMult: 1.15 },
  },
  fortified: {
    id: 'fortified', name: 'Fortified', icon: 'Heart', tier: 'rare', chain: 0,
    description: '+30% max HP, −10% damage taken',
    upgradesFrom: 'thick_skin', upgradesTo: 'unstoppable',
    modifiers: { maxHpMult: 1.30, damageTakenMult: 0.90 },
  },
  unstoppable: {
    id: 'unstoppable', name: 'Unstoppable', icon: 'Heart', tier: 'legendary', chain: 0,
    description: '+50% max HP, −15% damage taken, immune to stun',
    upgradesFrom: 'fortified',
    modifiers: { maxHpMult: 1.50, damageTakenMult: 0.85, stunImmune: true },
  },

  // ── Chain 1: Speed ───────────────────────────────────────────────────────
  swift_feet: {
    id: 'swift_feet', name: 'Swift Feet', icon: 'Wind', tier: 'common', chain: 1,
    description: '+1 move speed',
    upgradesTo: 'wind_runner',
    modifiers: { moveSpeedBonus: 1 },
  },
  wind_runner: {
    id: 'wind_runner', name: 'Wind Runner', icon: 'Wind', tier: 'rare', chain: 1,
    description: '+2 move speed',
    upgradesFrom: 'swift_feet', upgradesTo: 'phantom',
    modifiers: { moveSpeedBonus: 2 },
  },
  phantom: {
    id: 'phantom', name: 'Phantom', icon: 'Wind', tier: 'legendary', chain: 1,
    description: '+3 move speed, 15% chance to dodge zombie melee attacks',
    upgradesFrom: 'wind_runner',
    modifiers: { moveSpeedBonus: 3, dodgeChance: 0.15 },
  },

  // ── Chain 2: Mana ────────────────────────────────────────────────────────
  mana_well: {
    id: 'mana_well', name: 'Mana Well', icon: 'Infinity', tier: 'common', chain: 2,
    description: '+20% mana regen',
    upgradesTo: 'arcane_reservoir',
    modifiers: { manaRegenMult: 1.20 },
  },
  arcane_reservoir: {
    id: 'arcane_reservoir', name: 'Arcane Reservoir', icon: 'Infinity', tier: 'rare', chain: 2,
    description: '+40% mana regen, abilities cost 15% less mana',
    upgradesFrom: 'mana_well', upgradesTo: 'infinite_power',
    modifiers: { manaRegenMult: 1.40, manaCostMult: 0.85 },
  },
  infinite_power: {
    id: 'infinite_power', name: 'Infinite Power', icon: 'Infinity', tier: 'legendary', chain: 2,
    description: '+60% mana regen, abilities cost 30% less, zombie kills refund 5 mana',
    upgradesFrom: 'arcane_reservoir',
    modifiers: { manaRegenMult: 1.60, manaCostMult: 0.70, manaPerKill: 5 },
  },

  // ── Chain 3: Cooldowns ───────────────────────────────────────────────────
  quick_hands: {
    id: 'quick_hands', name: 'Quick Hands', icon: 'Timer', tier: 'common', chain: 3,
    description: '−15% ability cooldowns',
    upgradesTo: 'rapid_fire',
    modifiers: { cooldownMult: 0.85 },
  },
  rapid_fire: {
    id: 'rapid_fire', name: 'Rapid Fire', icon: 'Timer', tier: 'rare', chain: 3,
    description: '−30% ability cooldowns',
    upgradesFrom: 'quick_hands', upgradesTo: 'overclock',
    modifiers: { cooldownMult: 0.70 },
  },
  overclock: {
    id: 'overclock', name: 'Overclock', icon: 'Timer', tier: 'legendary', chain: 3,
    description: '−45% cooldowns, killing 10 zombies within 2s resets all cooldowns',
    upgradesFrom: 'rapid_fire',
    modifiers: { cooldownMult: 0.55, overclockKillThreshold: 10 },
  },

  // ── Chain 4: Toughness ───────────────────────────────────────────────────
  iron_will: {
    id: 'iron_will', name: 'Iron Will', icon: 'Shield', tier: 'common', chain: 4,
    description: '−10% damage taken',
    upgradesTo: 'stoneskin',
    modifiers: { damageTakenMult: 0.90 },
  },
  stoneskin: {
    id: 'stoneskin', name: 'Stoneskin', icon: 'Shield', tier: 'rare', chain: 4,
    description: '−20% damage taken, reflect 5 damage to melee attackers',
    upgradesFrom: 'iron_will', upgradesTo: 'colossus',
    modifiers: { damageTakenMult: 0.80, reflectDamage: 5 },
  },
  colossus: {
    id: 'colossus', name: 'Colossus', icon: 'Shield', tier: 'legendary', chain: 4,
    description: '−30% damage taken, reflect 10 damage, 3 DPS damaging aura',
    upgradesFrom: 'stoneskin',
    modifiers: { damageTakenMult: 0.70, reflectDamage: 10, auraDps: 3 },
  },

  // ── Chain 5: Static Shock ────────────────────────────────────────────────
  static_shock: {
    id: 'static_shock', name: 'Static Shock', icon: 'Zap', tier: 'common', chain: 5,
    description: 'Ability hits have a 25% chance to zap the nearest enemy for 15 damage',
    upgradesTo: 'overcharge',
    modifiers: { lightningChance: 0.25, lightningDamage: 15, lightningTargets: 1 },
  },
  overcharge: {
    id: 'overcharge', name: 'Overcharge', icon: 'Zap', tier: 'rare', chain: 5,
    description: 'Ability hits have a 30% chance to chain to 3 enemies for 20 damage',
    upgradesFrom: 'static_shock', upgradesTo: 'thunderstorm',
    modifiers: { lightningChance: 0.30, lightningDamage: 20, lightningTargets: 3 },
  },
  thunderstorm: {
    id: 'thunderstorm', name: 'Thunderstorm', icon: 'Zap', tier: 'legendary', chain: 5,
    description: 'Ability hits have a 35% chance to chain to 5 enemies for 35 damage and stun them for 0.5s',
    upgradesFrom: 'overcharge',
    modifiers: { lightningChance: 0.35, lightningDamage: 35, lightningTargets: 5, lightningStunMs: 500 },
  },

  // ── Chain 6: Ability Power ───────────────────────────────────────────────
  focused_mind: {
    id: 'focused_mind', name: 'Focused Mind', icon: 'Brain', tier: 'common', chain: 6,
    description: '+15% ability damage',
    upgradesTo: 'spell_surge',
    modifiers: { abilityDamageMult: 1.15 },
  },
  spell_surge: {
    id: 'spell_surge', name: 'Spell Surge', icon: 'Brain', tier: 'rare', chain: 6,
    description: '+30% ability damage',
    upgradesFrom: 'focused_mind', upgradesTo: 'archmage',
    modifiers: { abilityDamageMult: 1.30 },
  },
  archmage: {
    id: 'archmage', name: 'Archmage', icon: 'Brain', tier: 'legendary', chain: 6,
    description: '+50% ability damage, abilities leave a 2s burn DoT on hit',
    upgradesFrom: 'spell_surge',
    modifiers: { abilityDamageMult: 1.50, abilityBurnDamage: 4, abilityBurnDurationMs: 2000 },
  },

  // ── Chain 7: Adrenaline ──────────────────────────────────────────────────
  adrenaline: {
    id: 'adrenaline', name: 'Adrenaline', icon: 'Activity', tier: 'common', chain: 7,
    description: '+20% ability damage when below 40% HP',
    upgradesTo: 'frenzy',
    modifiers: { lowHpDamageMult: 1.20 },
  },
  frenzy: {
    id: 'frenzy', name: 'Frenzy', icon: 'Activity', tier: 'rare', chain: 7,
    description: '+30% ability damage and +1 move speed when below 40% HP',
    upgradesFrom: 'adrenaline', upgradesTo: 'last_stand',
    modifiers: { lowHpDamageMult: 1.30, lowHpSpeedBonus: 1 },
  },
  last_stand: {
    id: 'last_stand', name: 'Last Stand', icon: 'Activity', tier: 'legendary', chain: 7,
    description: '+50% ability damage, +2 move speed, and immune to stun when below 40% HP',
    upgradesFrom: 'frenzy',
    modifiers: { lowHpDamageMult: 1.50, lowHpSpeedBonus: 2, lowHpStunImmune: true },
  },

  // ── Chain 8: AoE ─────────────────────────────────────────────────────────
  wide_reach: {
    id: 'wide_reach', name: 'Wide Reach', icon: 'Expand', tier: 'common', chain: 8,
    description: '+1 AoE radius on all abilities',
    upgradesTo: 'blast_master',
    modifiers: { aoeSizeBonus: 1 },
  },
  blast_master: {
    id: 'blast_master', name: 'Blast Master', icon: 'Expand', tier: 'rare', chain: 8,
    description: '+2 AoE radius, +10% AoE ability damage',
    upgradesFrom: 'wide_reach', upgradesTo: 'cataclysm',
    modifiers: { aoeSizeBonus: 2, aoeDamageMult: 1.10 },
  },
  cataclysm: {
    id: 'cataclysm', name: 'Cataclysm', icon: 'Expand', tier: 'legendary', chain: 8,
    description: '+3 AoE radius, +20% AoE damage, AoE kills 15% chain-explode',
    upgradesFrom: 'blast_master',
    modifiers: { aoeSizeBonus: 3, aoeDamageMult: 1.20, chainExplosionChance: 0.15 },
  },

  // ── Chain 9: Precision ───────────────────────────────────────────────────
  keen_eye: {
    id: 'keen_eye', name: 'Keen Eye', icon: 'Crosshair', tier: 'common', chain: 9,
    description: '+10% critical hit chance (1.5× damage)',
    upgradesTo: 'sharpshooter',
    modifiers: { critChance: 0.10, critMultiplier: 1.5 },
  },
  sharpshooter: {
    id: 'sharpshooter', name: 'Sharpshooter', icon: 'Crosshair', tier: 'rare', chain: 9,
    description: '+15% critical hit chance (1.75× damage)',
    upgradesFrom: 'keen_eye', upgradesTo: 'deadeye',
    modifiers: { critChance: 0.15, critMultiplier: 1.75 },
  },
  deadeye: {
    id: 'deadeye', name: 'Deadeye', icon: 'Crosshair', tier: 'legendary', chain: 9,
    description: '+20% critical hit chance (2× damage), crits have 30% chance to reset ability cooldown',
    upgradesFrom: 'sharpshooter',
    modifiers: { critChance: 0.20, critMultiplier: 2.0, critCooldownResetChance: 0.30 },
  },
  // ── Chain 10: Poison ─────────────────────────────────────────────────────
  poison_touch: {
    id: 'poison_touch', name: 'Poison Touch', icon: 'Biohazard', tier: 'common', chain: 10,
    description: 'Ability hits poison targets dealing 5 damage per second for 2s',
    upgradesTo: 'toxic_spores',
    modifiers: { poisonDurationMs: 2000, poisonDamagePerSecond: 5 },
  },
  toxic_spores: {
    id: 'toxic_spores', name: 'Toxic Spores', icon: 'Biohazard', tier: 'rare', chain: 10,
    description: 'Ability hits poison targets dealing 5 damage per second for 4s',
    upgradesFrom: 'poison_touch', upgradesTo: 'plague',
    modifiers: { poisonDurationMs: 4000, poisonDamagePerSecond: 5 },
  },
  plague: {
    id: 'plague', name: 'Plague', icon: 'Biohazard', tier: 'legendary', chain: 10,
    description: 'Ability hits poison targets for 6s (5 DPS); hits also poison all zombies in a 1.5 radius',
    upgradesFrom: 'toxic_spores',
    modifiers: { poisonDurationMs: 6000, poisonDamagePerSecond: 5, poisonSpreadRadius: 1.5 },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All perk ids, for iteration / validation. */
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** All common-tier perk ids. */
export const COMMON_PERK_IDS = PERK_IDS.filter((id) => PERKS[id].tier === 'common');

/** Runtime guard. */
export function isPerkId(value: unknown): value is PerkId {
  return typeof value === 'string' && value in PERKS;
}

/** Which upgrade tier is offered at a given wave level, or `null` if the wave
 *  is before perks start or after all upgrades are done. */
export function perkPhaseAtWave(level: number): 'pick' | 'upgrade_rare' | 'upgrade_legendary' | null {
  if (level < PERK_FIRST_WAVE) return null;
  if (level < PERK_RARE_WAVE) return 'pick';
  if (level < PERK_LEGENDARY_WAVE) return 'upgrade_rare';
  // Waves 9, 10, 11 → legendary upgrades; wave 12+ → all done (handled by caller
  // checking if any perks are still upgradeable).
  return 'upgrade_legendary';
}

/** True when a player's perk set is fully maxed (all 3 are legendary). */
export function perksFullyMaxed(perkIds: readonly PerkId[]): boolean {
  return perkIds.length >= PERK_MAX_SLOTS && perkIds.every((id) => PERKS[id].tier === 'legendary');
}

/** Get the chain index for a perk id. */
export function perkChainIndex(id: PerkId): number {
  return PERKS[id].chain;
}
