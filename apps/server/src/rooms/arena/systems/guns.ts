import {
  DEFAULT_GUN,
  GUNS,
  GUN_BY_SLOT,
  GUN_KINDS,
  GUN_RESERVE_INFINITE,
  ServerMessage,
  type GunKind,
} from '@arena/shared';
import type { Player } from '../../schema.js';
import type { ArenaContext } from '../context.js';
import type { ProjectileSystem } from './projectiles.js';

/** How long the fire pose holds after a shot (ms). */
const SHOOT_POSE_MS = 180;

/** Server-only gun state for one player: per-gun magazine + reserve (so switching
 *  weapons keeps each gun's ammo), the equipped gun, and the fire-rate / reload
 *  clocks. The equipped gun's ammo is mirrored to the replicated {@link Player}
 *  fields for the HUD. */
interface GunState {
  equipped: GunKind;
  /** Rounds currently in each gun's magazine. */
  mag: Record<GunKind, number>;
  /** Reserve rounds per gun; -1 ({@link GUN_RESERVE_INFINITE}) = unlimited. */
  reserve: Record<GunKind, number>;
  /** Sim time (ms) the next shot is allowed (fire-rate gate). */
  nextFireAt: number;
  /** Sim time (ms) the in-progress reload completes; 0 if not reloading. */
  reloadDoneAt: number;
}

/**
 * Gun Mode Zombie weapons: equip / fire / reload / switch, with server-authoritative
 * magazines, fire rates, and reloads. Bullets are spawned through the shared
 * {@link ProjectileSystem} (reusing its collision + damage). Only the equipped
 * gun's ammo is replicated (on {@link Player}); the rest of the state is server-only.
 */
export class GunSystem {
  private readonly state = new Map<string, GunState>();

  constructor(
    private readonly ctx: ArenaContext,
    private readonly projectiles: ProjectileSystem,
  ) {}

  /** Give a player a fresh loadout (called on spawn/respawn): both guns at full
   *  magazines + full reserves, the default gun equipped, no reload pending. */
  equipLoadout(player: Player): void {
    const mag = {} as Record<GunKind, number>;
    const reserve = {} as Record<GunKind, number>;
    for (const id of GUN_KINDS) {
      mag[id] = GUNS[id].magSize;
      reserve[id] = GUNS[id].reserve;
    }
    this.state.set(player.sessionId, {
      equipped: DEFAULT_GUN,
      mag,
      reserve,
      nextFireAt: 0,
      reloadDoneAt: 0,
    });
    this.sync(player);
  }

  /** Equip the gun bound to a number-key slot (3 = pistol, 4 = machine gun). A
   *  switch cancels any in-progress reload and is a no-op if already equipped. */
  switchTo(player: Player, slot: number): void {
    const gun = GUN_BY_SLOT[slot];
    if (!gun) return;
    const gs = this.state.get(player.sessionId);
    if (!gs || gs.equipped === gun) return;
    gs.equipped = gun;
    gs.reloadDoneAt = 0; // swapping interrupts a reload
    this.sync(player);
  }

  /** Fire the equipped gun toward a (already-normalized) direction. No-ops while
   *  reloading, on fire-rate cooldown, or with an empty magazine. */
  fire(player: Player, dirX: number, dirZ: number): void {
    const gs = this.state.get(player.sessionId);
    if (!gs || !player.alive) return;
    const now = this.ctx.now();
    if (gs.reloadDoneAt > 0 || now < gs.nextFireAt || gs.mag[gs.equipped] <= 0) return;

    const cfg = GUNS[gs.equipped];
    gs.mag[gs.equipped] -= 1;
    gs.nextFireAt = now + cfg.fireRateMs;
    player.rotation = Math.atan2(dirX, dirZ);
    this.projectiles.spawnGunBullet(player, dirX, dirZ, cfg);
    this.ctx.animOneShots.set(player.sessionId, { name: 'attack', until: now + SHOOT_POSE_MS });
    this.ctx.broadcast(ServerMessage.WeaponFired, {
      shooterId: player.sessionId,
      gun: gs.equipped,
      x: player.x,
      z: player.z,
      dirX,
      dirZ,
    });
    this.sync(player);
  }

  /** Begin reloading the equipped gun. No-op if already reloading, the magazine is
   *  already full, or there's no reserve to draw from. */
  reload(player: Player): void {
    const gs = this.state.get(player.sessionId);
    if (!gs || !player.alive) return;
    const cfg = GUNS[gs.equipped];
    if (gs.reloadDoneAt > 0) return;
    if (gs.mag[gs.equipped] >= cfg.magSize) return;
    if (gs.reserve[gs.equipped] === 0) return; // out of spare ammo (finite reserve)
    gs.reloadDoneAt = this.ctx.now() + cfg.reloadMs;
    this.sync(player);
  }

  /** Advance reload timers: complete any reload whose timer has elapsed, drawing
   *  from the (finite or infinite) reserve. Called once per tick. */
  update(): void {
    if (this.state.size === 0) return;
    const now = this.ctx.now();
    this.state.forEach((gs, sessionId) => {
      if (gs.reloadDoneAt === 0 || now < gs.reloadDoneAt) return;
      const player = this.ctx.state.players.get(sessionId);
      gs.reloadDoneAt = 0;
      if (!player) return;
      const cfg = GUNS[gs.equipped];
      const need = cfg.magSize - gs.mag[gs.equipped];
      if (gs.reserve[gs.equipped] === GUN_RESERVE_INFINITE) {
        gs.mag[gs.equipped] = cfg.magSize; // unlimited reserve (pistol)
      } else {
        const taken = Math.min(need, gs.reserve[gs.equipped]);
        gs.mag[gs.equipped] += taken;
        gs.reserve[gs.equipped] -= taken;
      }
      this.sync(player);
    });
  }

  /** Drop a player's gun state (on leave/removal). */
  remove(sessionId: string): void {
    this.state.delete(sessionId);
  }

  /** Mirror the equipped gun's ammo onto the replicated player fields (HUD). */
  private sync(player: Player): void {
    const gs = this.state.get(player.sessionId);
    if (!gs) return;
    player.equippedGun = gs.equipped;
    player.magAmmo = gs.mag[gs.equipped];
    player.reserveAmmo = gs.reserve[gs.equipped];
    player.reloading = gs.reloadDoneAt > 0;
  }
}
