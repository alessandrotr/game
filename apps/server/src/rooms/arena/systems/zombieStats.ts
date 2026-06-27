import {
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_FAT_SKIN_ID,
  ZOMBIE_MINIBOSS_SKIN_ID,
  TITAN_SKIN_ID,
  isZombieSkin,
} from '@arena/shared';
import type { ArenaState } from '../../schema.js';

/** A single human player's running tallies for one zombie-survival run. Held in
 *  memory only; folded into the persisted per-class lifetime stats on leave and
 *  surfaced on the end-of-run card. */
export interface ZombieRunStats {
  killsNormal: number;
  killsSprinter: number;
  killsFat: number;
  killsMiniboss: number;
  killsTitan: number;
  perksPicked: number;
  altars: number;
  doors: number;
  traps: number;
  damageDealt: number;
  damageTaken: number;
  /** Sim time (ms) the player entered the run. */
  startedAt: number;
  /** Sim time (ms) the player fell (co-op only; null while alive / in respawn mode). */
  diedAt: number | null;
  /** Wave the player was on when they fell (co-op only). */
  waveAtDeath: number | null;
}

function blank(now: number): ZombieRunStats {
  return {
    killsNormal: 0,
    killsSprinter: 0,
    killsFat: 0,
    killsMiniboss: 0,
    killsTitan: 0,
    perksPicked: 0,
    altars: 0,
    doors: 0,
    traps: 0,
    damageDealt: 0,
    damageTaken: 0,
    startedAt: now,
    diedAt: null,
    waveAtDeath: null,
  };
}

/**
 * Per-player run-stat accumulator for zombie survival. The combat / perk / ritual
 * / trap systems push events here; the room reads a player's tally on leave (to
 * persist) and on game-over (to build the results card). Built only in zombie
 * mode — every recorder is a no-op for sessions without a started run (bots, or
 * players whose profile hasn't loaded), so callers never need to guard.
 */
export class ZombieStats {
  private readonly runs = new Map<string, ZombieRunStats>();

  constructor(
    private readonly state: ArenaState,
    private readonly now: () => number,
  ) {}

  /** Begin tracking a human player's run (called when they join the room). */
  start(sessionId: string): void {
    this.runs.set(sessionId, blank(this.now()));
  }

  get(sessionId: string): ZombieRunStats | undefined {
    return this.runs.get(sessionId);
  }

  forget(sessionId: string): void {
    this.runs.delete(sessionId);
  }

  /** Credit a zombie kill, bucketed by the victim's variant. */
  recordKill(sessionId: string, victimSkinId: string): void {
    const s = this.runs.get(sessionId);
    if (!s) return;
    switch (victimSkinId) {
      case ZOMBIE_SPRINTER_SKIN_ID:
        s.killsSprinter += 1;
        break;
      case ZOMBIE_FAT_SKIN_ID:
        s.killsFat += 1;
        break;
      case ZOMBIE_MINIBOSS_SKIN_ID:
        s.killsMiniboss += 1;
        break;
      case TITAN_SKIN_ID:
        s.killsTitan += 1;
        break;
      default:
        s.killsNormal += 1;
        break;
    }
  }

  recordDamageDealt(sessionId: string, amount: number): void {
    const s = this.runs.get(sessionId);
    if (s) s.damageDealt += amount;
  }

  recordDamageTaken(sessionId: string, amount: number): void {
    const s = this.runs.get(sessionId);
    if (s) s.damageTaken += amount;
  }

  recordPerkPick(sessionId: string): void {
    const s = this.runs.get(sessionId);
    if (s) s.perksPicked += 1;
  }

  /** The altar is claimed by a specific player — credit only them. */
  recordAltar(sessionId: string): void {
    const s = this.runs.get(sessionId);
    if (s) s.altars += 1;
  }

  /** Latch the player's death moment so survival time / best wave reflect when
   *  they actually fell (co-op). Only the first death counts. */
  recordDeath(sessionId: string, wave: number): void {
    const s = this.runs.get(sessionId);
    if (s && s.diedAt === null) {
      s.diedAt = this.now();
      s.waveAtDeath = wave;
    }
  }

  /** A door unlock is a shared objective — credit every human still in the run. */
  recordDoorForAll(): void {
    this.forEachHuman((s) => (s.doors += 1));
  }

  /** A trap firing is a shared objective — credit every human still in the run. */
  recordTrapForAll(): void {
    this.forEachHuman((s) => (s.traps += 1));
  }

  private forEachHuman(fn: (s: ZombieRunStats) => void): void {
    this.state.players.forEach((player, id) => {
      if (isZombieSkin(player.skinId)) return;
      const s = this.runs.get(id);
      if (s) fn(s);
    });
  }
}
