import {
  COMMON_PERK_IDS,
  IDENTITY_MODIFIERS,
  PERK_AUTOPICK_MS,
  PERK_MAX_SLOTS,
  PERKS,
  ServerMessage,
  computePerkModifiers,
  isPerkId,
  perkPhaseAtWave,
  perksFullyMaxed,
  type PerkId,
  type PerkModifiers,
  type CharacterClass,
} from '@arena/shared';
import type { Player } from '../schema.js';
import type { ArenaContext } from './context.js';

// The modifier struct, its identity, and the data-driven fold now live in
// `@arena/shared` (perk-modifiers.ts) so the server and client compute perk
// stats from the exact same source. Re-exported here for back-compat with the
// many call sites that import these from this module.
export { IDENTITY_MODIFIERS } from '@arena/shared';
export type { PerkModifiers } from '@arena/shared';

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

    // Apply HP/maxHP adjustments immediately when picking health perks.
    this.applyMaxHp(sessionId, player);

    return true;
  }

  /** Recompute a player's max HP from their class base × the current maxHp perk
   *  multiplier, preserving the HP delta (a gain heals; a loss clamps). Call
   *  after any change to the player's perk set. */
  private applyMaxHp(sessionId: string, player: Player): void {
    const stats = this.ctx.tuning.classStats[player.characterClass as CharacterClass];
    if (!stats) return;
    const oldMaxHp = player.maxHp;
    const newMaxHp = stats.health * (this.computeModifiers(sessionId).maxHpMult ?? 1);
    if (newMaxHp === oldMaxHp) return;
    const diff = newMaxHp - oldMaxHp;
    player.maxHp = newMaxHp;
    if (diff > 0) player.hp += diff;
    else player.hp = Math.min(player.hp, player.maxHp);
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

  // ── Dev tooling ────────────────────────────────────────────────────────────

  /** Dev-only: force-grant a perk (bypassing the offer flow), so any perk can be
   *  tested without playing to its wave. If the player already owns a lower tier
   *  in the same chain it's upgraded in place; otherwise it fills a free slot
   *  (replacing the oldest if full). Returns true if the set changed. */
  devGrant(sessionId: string, perkId: PerkId): boolean {
    const player = this.ctx.state.players.get(sessionId);
    if (!player) return false;
    const myPerks = this.perks.get(sessionId) ?? [];
    const chain = PERKS[perkId].chain;
    const existingIdx = myPerks.findIndex((id) => PERKS[id].chain === chain);
    if (existingIdx >= 0) {
      if (myPerks[existingIdx] === perkId) return false; // already owned
      myPerks[existingIdx] = perkId; // swap to the requested tier of this chain
    } else if (myPerks.length < PERK_MAX_SLOTS) {
      myPerks.push(perkId);
    } else {
      myPerks[0] = perkId; // full: evict the oldest slot
    }
    this.perks.set(sessionId, myPerks);
    this.syncToSchema(sessionId, player);
    this.modCache.delete(sessionId);
    this.applyMaxHp(sessionId, player);
    return true;
  }

  /** Dev-only: clear every perk from a player (reset to a clean slate). */
  devClear(sessionId: string): void {
    const player = this.ctx.state.players.get(sessionId);
    this.perks.set(sessionId, []);
    this.modCache.delete(sessionId);
    if (player) {
      this.syncToSchema(sessionId, player);
      this.applyMaxHp(sessionId, player);
    }
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

  /** Build the aggregate modifiers from a player's active perks. The actual
   *  magnitudes live as data on each {@link PERKS} entry; this just folds the
   *  player's active set via the shared {@link computePerkModifiers}. */
  private computeModifiers(sessionId: string): PerkModifiers {
    const ids = this.perks.get(sessionId);
    if (!ids || ids.length === 0) return { ...IDENTITY_MODIFIERS };
    return computePerkModifiers(ids);
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
  let bonus = mods.moveSpeedBonus;
  if (player.alive && player.maxHp > 0 && player.hp / player.maxHp < 0.40) {
    mult *= mods.lowHpSpeedMult;
    bonus += mods.lowHpSpeedBonus;
  }
  return { mult, bonus };
}
