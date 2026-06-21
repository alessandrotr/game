import {
  COMMON_PERK_IDS,
  PERK_AUTOPICK_MS,
  PERK_MAX_SLOTS,
  PERKS,
  ServerMessage,
  isPerkId,
  perkPhaseAtWave,
  perksFullyMaxed,
  type PerkId,
  type CharacterClass,
} from '@arena/shared';
import type { Player } from '../schema.js';
import type { ArenaContext } from './context.js';

// ---------------------------------------------------------------------------
// Perk modifiers — the aggregate stat scalars read by the combat/tick loops.
// ---------------------------------------------------------------------------

/** The computed stat modifiers from a player's active perks. Every field
 *  defaults to the identity (1 for multipliers, 0 for flat adds). */
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
  /** Kick damage multiplier. */
  kickDamageMult: number;
  /** Kick force multiplier. */
  kickForceMult: number;
  /** True if the player is immune to stun. */
  stunImmune: boolean;
  /** Mana refunded per zombie kill (flat). */
  manaPerKill: number;
  /** Overclock: kills required within the window to reset all cooldowns. */
  overclockKillThreshold: number;
  /** AoE kill chain-explosion chance (0–1). */
  chainExplosionChance: number;
  /** Kick AoE shockwave damage (0 = no shockwave). */
  kickAoeDamage: number;
  /** Kick AoE stun duration (ms, 0 = no stun). */
  kickAoeStunMs: number;
  /** Colossus damaging aura DPS. */
  auraDps: number;
  /** Ability burn DoT: damage per tick (0 = disabled). */
  abilityBurnDamage: number;
  /** Ability burn DoT: duration (ms). */
  abilityBurnDurationMs: number;
  /** Static shock: activation chance on ability hit (0-1). */
  lightningChance: number;
  /** Static shock: flat damage dealt. */
  lightningDamage: number;
  /** Static shock: maximum number of targets to chain to. */
  lightningTargets: number;
  /** Static shock: stun duration (ms) applied. */
  lightningStunMs: number;
  /** Adrenaline: extra ability damage multiplier when below 40% HP. */
  lowHpDamageMult: number;
  /** Adrenaline: extra move speed multiplier when below 40% HP. */
  lowHpSpeedMult: number;
  /** Adrenaline: stun immunity when below 40% HP. */
  lowHpStunImmune: boolean;
  /** Dodge chance: probability (0-1) of avoiding a zombie melee hit. */
  dodgeChance: number;
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
  kickDamageMult: 1,
  kickForceMult: 1,
  stunImmune: false,
  manaPerKill: 0,
  overclockKillThreshold: 0,
  chainExplosionChance: 0,
  kickAoeDamage: 0,
  kickAoeStunMs: 0,
  auraDps: 0,
  abilityBurnDamage: 0,
  abilityBurnDurationMs: 0,
  lightningChance: 0,
  lightningDamage: 0,
  lightningTargets: 0,
  lightningStunMs: 0,
  lowHpDamageMult: 1,
  lowHpSpeedMult: 1,
  lowHpStunImmune: false,
  dodgeChance: 0,
};

// ---------------------------------------------------------------------------
// Pending offer (server-only state for one player's unanswered perk offer).
// ---------------------------------------------------------------------------

interface PendingOffer {
  /** The two visible perk ids shown to the player. */
  visible: [PerkId, PerkId];
  /** True when this is an upgrade wave (rare or legendary). */
  isUpgrade: boolean;
  /** For upgrade waves: the fixed-offer source perk to upgrade. */
  fixedUpgradeFrom?: PerkId;
  /** For upgrade waves: the fixed-offer destination perk. */
  fixedUpgradeTo?: PerkId;
  /** Sim-time (ms) the auto-pick fires if the player hasn't responded. */
  autoPickAt: number;
}

// ---------------------------------------------------------------------------
// PerkSystem
// ---------------------------------------------------------------------------

/**
 * Zombie-mode perk progression: offers perk picks on wave clear, validates
 * player choices, tracks active perks per player, and computes aggregate stat
 * modifiers read by the combat/tick loops. Self-gates on zombie + ability mode.
 *
 * Lifecycle:
 *  - `onWaveClear(level)` → rolls offers for each human player.
 *  - `handlePick(sessionId, slot, upgradeTarget?)` → validates & applies.
 *  - `update(now)` → auto-picks for AFK players.
 *  - `getModifiers(sessionId)` → returns the aggregate stat scalars.
 */
export class PerkSystem {
  /** Active perks per player (session id → up to 3 perk ids). */
  private readonly perks = new Map<string, PerkId[]>();
  /** Pending unanswered offers. */
  private readonly offers = new Map<string, PendingOffer>();
  /** Cached modifiers (invalidated on any perk change). */
  private readonly modCache = new Map<string, PerkModifiers>();

  /** Per-wave state: how many times the low-HP burst has fired this wave. */
  readonly burstHealUsed = new Map<string, number>();
  /** Per-game state: whether the self-revive has been consumed. */
  readonly selfReviveUsed = new Set<string>();
  /** Per-player overclock kill tracker: timestamps of recent kills (ms). */
  readonly recentKills = new Map<string, number[]>();

  constructor(private readonly ctx: ArenaContext) {}

  // ── Offer lifecycle ──────────────────────────────────────────────────────

  /** Roll and send perk offers to every human player after a wave clear.
   *  Returns true if any offers were sent (the caller should pause the wave). */
  onWaveClear(level: number): boolean {
    const phase = perkPhaseAtWave(level);
    if (!phase) return false;

    let anySent = false;
    this.ctx.state.players.forEach((player, sessionId) => {
      // Skip bots / zombies.
      if (player.skinId.startsWith('skin.zombie')) return;
      const myPerks = this.perks.get(sessionId) ?? [];
      // Skip fully maxed players.
      if (perksFullyMaxed(myPerks)) return;

      if (phase === 'pick') {
        if (myPerks.length >= PERK_MAX_SLOTS) return; // already full
        this.sendPickOffer(sessionId, myPerks);
        anySent = true;
      } else {
        // upgrade_rare or upgrade_legendary
        const targetTier = phase === 'upgrade_rare' ? 'common' : 'rare';
        const upgradeable = myPerks.filter((id) => PERKS[id].tier === targetTier);
        if (upgradeable.length === 0) return; // nothing to upgrade
        this.sendUpgradeOffer(sessionId, myPerks, upgradeable);
        anySent = true;
      }
    });

    // Reset per-wave perk charges.
    this.burstHealUsed.clear();

    return anySent;
  }

  /** True if any human player still has a pending perk offer. */
  hasPendingOffers(): boolean {
    return this.offers.size > 0;
  }

  /** Per-tick: auto-pick for AFK players whose timer has elapsed. */
  update(now: number): void {
    for (const [sessionId, offer] of this.offers) {
      if (now >= offer.autoPickAt) {
        // Auto-pick the jolly (slot 2).
        this.handlePick(sessionId, 2);
      }
    }
  }

  // ── Handle the player's choice ───────────────────────────────────────────

  /** Validate and apply a perk pick or upgrade. Returns true on success. */
  handlePick(sessionId: string, slot: number, upgradeTarget?: PerkId): boolean {
    const offer = this.offers.get(sessionId);
    if (!offer) return false;
    const player = this.ctx.state.players.get(sessionId);
    if (!player) return false;

    const myPerks = this.perks.get(sessionId) ?? [];

    if (!offer.isUpgrade) {
      // ── Fresh pick ──
      if (myPerks.length >= PERK_MAX_SLOTS) { this.offers.delete(sessionId); return false; }
      let chosen: PerkId;
      if (slot === 0) chosen = offer.visible[0];
      else if (slot === 1) chosen = offer.visible[1];
      else {
        // Jolly: pick a random common not in the offer and not already owned.
        const pool = COMMON_PERK_IDS.filter(
          (id) => id !== offer.visible[0] && id !== offer.visible[1] && !myPerks.includes(id),
        );
        chosen = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : offer.visible[0];
      }
      if (myPerks.includes(chosen)) { this.offers.delete(sessionId); return false; }
      myPerks.push(chosen);
    } else {
      // ── Upgrade ──

      // ── [SAVED] Fixed-offer upgrade (slot 1) — commented out; restore if desired. ──
      // if (slot === 1 && offer.fixedUpgradeFrom && offer.fixedUpgradeTo) {
      //   this.applyUpgrade(myPerks, offer.fixedUpgradeFrom, offer.fixedUpgradeTo);
      // } else
      if (slot === 0 && upgradeTarget && isPerkId(upgradeTarget)) {
        // Free-choice upgrade: the player picks which perk to upgrade.
        const def = PERKS[upgradeTarget];
        const samplePerk = offer.visible[0];
        const allowedTier = PERKS[samplePerk].tier;
        if (!def.upgradesTo || !myPerks.includes(upgradeTarget) || def.tier !== allowedTier) {
          this.offers.delete(sessionId);
          return false;
        }
        this.applyUpgrade(myPerks, upgradeTarget, def.upgradesTo);
      } else {
        // Jolly: randomly upgrade one of the eligible perks.
        // Determine which tier is upgradeable from the visible ids.
        const samplePerk = offer.visible[0];
        const targetTier = PERKS[samplePerk].tier;
        const upgradeable = myPerks.filter(
          (id) => PERKS[id].tier === targetTier && PERKS[id].upgradesTo,
        );
        if (upgradeable.length > 0) {
          const pick = upgradeable[Math.floor(Math.random() * upgradeable.length)]!;
          this.applyUpgrade(myPerks, pick, PERKS[pick].upgradesTo!);
        }
      }
    }

    this.perks.set(sessionId, myPerks);
    this.syncToSchema(sessionId, player);
    this.modCache.delete(sessionId);
    this.offers.delete(sessionId);

    // Apply HP/maxHP adjustments immediately when picking health perks
    const stats = this.ctx.tuning.classStats[player.characterClass as CharacterClass];
    if (stats) {
      const oldMaxHp = player.maxHp;
      const newMaxHp = stats.health * (this.computeModifiers(sessionId).maxHpMult ?? 1);
      if (newMaxHp !== oldMaxHp) {
        const diff = newMaxHp - oldMaxHp;
        player.maxHp = newMaxHp;
        if (diff > 0) {
          player.hp += diff;
        } else {
          player.hp = Math.min(player.hp, player.maxHp);
        }
      }
    }

    return true;
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /** Get the aggregate perk modifiers for a player (cached). */
  getModifiers(sessionId: string): PerkModifiers {
    const cached = this.modCache.get(sessionId);
    if (cached) return cached;
    const mods = this.computeModifiers(sessionId);
    this.modCache.set(sessionId, mods);
    return mods;
  }

  /** Get the active perk ids for a player. */
  getPerks(sessionId: string): readonly PerkId[] {
    return this.perks.get(sessionId) ?? [];
  }

  /** Clear a player's perks (on leave or game restart). */
  reset(sessionId: string): void {
    this.perks.delete(sessionId);
    this.offers.delete(sessionId);
    this.modCache.delete(sessionId);
    this.burstHealUsed.delete(sessionId);
    this.selfReviveUsed.delete(sessionId);
    this.recentKills.delete(sessionId);
  }

  /** Initialize empty perk state for a joining player. */
  init(sessionId: string): void {
    this.perks.set(sessionId, []);
  }

  /** Reset per-wave perk charges (called when a new wave begins). */
  resetWaveCharges(): void {
    this.burstHealUsed.clear();
  }

  // ── Overclock tracking ───────────────────────────────────────────────────

  /** Record a zombie kill for overclock tracking. Returns true if the
   *  threshold was reached and all cooldowns should be reset. */
  recordKill(sessionId: string, now: number): boolean {
    const mods = this.getModifiers(sessionId);
    if (mods.overclockKillThreshold <= 0) return false;
    const kills = this.recentKills.get(sessionId) ?? [];
    kills.push(now);
    // Prune kills older than 2 seconds.
    const cutoff = now - 2000;
    while (kills.length > 0 && kills[0]! < cutoff) kills.shift();
    this.recentKills.set(sessionId, kills);
    return kills.length >= mods.overclockKillThreshold;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Send a fresh-pick offer (waves 3–5). */
  private sendPickOffer(sessionId: string, myPerks: PerkId[]): void {
    const pool = COMMON_PERK_IDS.filter((id) => !myPerks.includes(id));
    if (pool.length < 2) return; // shouldn't happen (9 chains, max 3 owned)
    // Pick 2 distinct random commons.
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const visible: [PerkId, PerkId] = [shuffled[0]!, shuffled[1]!];

    const offer: PendingOffer = {
      visible,
      isUpgrade: false,
      autoPickAt: this.ctx.now() + PERK_AUTOPICK_MS,
    };
    this.offers.set(sessionId, offer);
    this.ctx.send(sessionId, ServerMessage.PerkOffer, {
      visible,
      isUpgrade: false,
    });
  }

  /** Send an upgrade offer (waves 6–11). The player sees their own upgradeable
   *  perks and picks which one to upgrade (slot 0 = free choice, slot 2 = jolly).
   *  The visible array carries two upgradeable ids so the jolly can infer the tier. */
  private sendUpgradeOffer(sessionId: string, _myPerks: PerkId[], upgradeable: PerkId[]): void {
    // ── [SAVED] Fixed-offer upgrade — commented out; restore if desired. ──
    // // Pick a random upgradeable perk for the fixed offer (slot 1).
    // const fixedFrom = upgradeable[Math.floor(Math.random() * upgradeable.length)]!;
    // const fixedTo = PERKS[fixedFrom].upgradesTo!;
    // const visible: [PerkId, PerkId] = [fixedFrom, fixedTo];
    // const offer: PendingOffer = {
    //   visible,
    //   isUpgrade: true,
    //   fixedUpgradeFrom: fixedFrom,
    //   fixedUpgradeTo: fixedTo,
    //   autoPickAt: this.ctx.now() + PERK_AUTOPICK_MS,
    // };
    // this.offers.set(sessionId, offer);
    // this.ctx.send(sessionId, ServerMessage.PerkOffer, {
    //   visible,
    //   isUpgrade: true,
    //   fixedUpgradeFrom: fixedFrom,
    //   fixedUpgradeTo: fixedTo,
    // });

    // Visible carries two upgradeable ids so the jolly fallback knows the tier.
    const a = upgradeable[0]!;
    const b = upgradeable.length > 1 ? upgradeable[1]! : a;
    const visible: [PerkId, PerkId] = [a, b];

    const offer: PendingOffer = {
      visible,
      isUpgrade: true,
      // No fixed offer — player chooses freely.
      autoPickAt: this.ctx.now() + PERK_AUTOPICK_MS,
    };
    this.offers.set(sessionId, offer);
    this.ctx.send(sessionId, ServerMessage.PerkOffer, {
      visible,
      isUpgrade: true,
    });
  }

  /** Replace a perk with its upgrade in the player's list. */
  private applyUpgrade(myPerks: PerkId[], from: PerkId, to: PerkId): void {
    const idx = myPerks.indexOf(from);
    if (idx >= 0) myPerks[idx] = to;
  }

  /** Mirror active perks onto the replicated Player fields. */
  private syncToSchema(sessionId: string, player: Player): void {
    const p = this.perks.get(sessionId) ?? [];
    player.perk1 = p[0] ?? '';
    player.perk2 = p[1] ?? '';
    player.perk3 = p[2] ?? '';
  }

  /** Build the aggregate modifiers from a player's active perks. */
  private computeModifiers(sessionId: string): PerkModifiers {
    const ids = this.perks.get(sessionId);
    if (!ids || ids.length === 0) return { ...IDENTITY_MODIFIERS };

    const m: PerkModifiers = { ...IDENTITY_MODIFIERS };
    for (const id of ids) {
      switch (id) {
        // ── Durability chain ─────────────────────────────────────────
        case 'thick_skin':
          m.maxHpMult *= 1.15;
          break;
        case 'fortified':
          m.maxHpMult *= 1.30;
          m.damageTakenMult *= 0.90;
          break;
        case 'unstoppable':
          m.maxHpMult *= 1.50;
          m.damageTakenMult *= 0.85;
          m.stunImmune = true;
          break;

        // ── Speed chain ──────────────────────────────────────────────
        case 'swift_feet':
          m.moveSpeedBonus += 1;
          break;
        case 'wind_runner':
          m.moveSpeedBonus += 2;
          break;
        case 'phantom':
          m.moveSpeedBonus += 3;
          m.dodgeChance = 0.15;
          break;

        // ── Mana chain ───────────────────────────────────────────────
        case 'mana_well':
          m.manaRegenMult *= 1.20;
          break;
        case 'arcane_reservoir':
          m.manaRegenMult *= 1.40;
          m.manaCostMult *= 0.85;
          break;
        case 'infinite_power':
          m.manaRegenMult *= 1.60;
          m.manaCostMult *= 0.70;
          m.manaPerKill = 5;
          break;

        // ── Cooldown chain ───────────────────────────────────────────
        case 'quick_hands':
          m.cooldownMult *= 0.85;
          break;
        case 'rapid_fire':
          m.cooldownMult *= 0.70;
          break;
        case 'overclock':
          m.cooldownMult *= 0.55;
          m.overclockKillThreshold = 10;
          break;

        // ── Toughness chain ──────────────────────────────────────────
        case 'iron_will':
          m.damageTakenMult *= 0.90;
          break;
        case 'stoneskin':
          m.damageTakenMult *= 0.80;
          m.reflectDamage = 5;
          break;
        case 'colossus':
          m.damageTakenMult *= 0.70;
          m.reflectDamage = 10;
          m.auraDps = 3;
          break;

        // ── Static Shock chain ────────────────────────────────────────
        case 'static_shock':
          m.lightningChance = 0.25;
          m.lightningDamage = 15;
          m.lightningTargets = 1;
          break;
        case 'overcharge':
          m.lightningChance = 0.30;
          m.lightningDamage = 20;
          m.lightningTargets = 3;
          break;
        case 'thunderstorm':
          m.lightningChance = 0.35;
          m.lightningDamage = 35;
          m.lightningTargets = 5;
          m.lightningStunMs = 500;
          break;

        // ── Ability Power chain ──────────────────────────────────────
        case 'focused_mind':
          m.abilityDamageMult *= 1.15;
          break;
        case 'spell_surge':
          m.abilityDamageMult *= 1.30;
          break;
        case 'archmage':
          m.abilityDamageMult *= 1.50;
          m.abilityBurnDamage = 4;
          m.abilityBurnDurationMs = 2000;
          break;

        // ── Adrenaline chain ──────────────────────────────────────────────────
        case 'adrenaline':
          m.lowHpDamageMult = 1.20;
          break;
        case 'frenzy':
          m.lowHpDamageMult = 1.30;
          m.lowHpSpeedMult = 1.15;
          break;
        case 'last_stand':
          m.lowHpDamageMult = 1.50;
          m.lowHpSpeedMult = 1.25;
          m.lowHpStunImmune = true;
          break;

        // ── AoE chain ────────────────────────────────────────────────
        case 'wide_reach':
          m.aoeSizeBonus += 1;
          break;
        case 'blast_master':
          m.aoeSizeBonus += 2;
          m.aoeDamageMult *= 1.10;
          break;
        case 'cataclysm':
          m.aoeSizeBonus += 3;
          m.aoeDamageMult *= 1.20;
          m.chainExplosionChance = 0.15;
          break;
      }
    }
    return m;
  }
}

/**
 * Helper to calculate the perk movement speed multiplier, dynamically
 * checking if the player is below 40% HP to apply lowHpSpeedMult.
 */
export function getPerkMoveSpeedMult(perkSystem: PerkSystem | undefined, player: Player): { mult: number; bonus: number } {
  if (!perkSystem) return { mult: 1, bonus: 0 };
  const mods = perkSystem.getModifiers(player.sessionId);
  let mult = 1;
  if (player.alive && player.maxHp > 0 && player.hp / player.maxHp < 0.40) {
    mult *= mods.lowHpSpeedMult;
  }
  return { mult, bonus: mods.moveSpeedBonus };
}
