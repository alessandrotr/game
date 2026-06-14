import {
  PICKABLES,
  PICKABLE_DROP_CHANCE,
  PICKABLE_GROUND_TTL_MS,
  PICKABLE_GROUND_Y,
  PICKABLE_PICKUP_RADIUS,
  ServerMessage,
  isPickableKind,
  type PickableKind,
} from '@arena/shared';
import { Pickable, type Player } from '../schema.js';
import type { ArenaContext } from './context.js';
import type { CombatSystem } from './combat.js';
import type { ProjectileSystem } from './projectiles.js';
import type { GroundZoneSystem } from './groundZones.js';

/**
 * Pickable objects — the grab/carry/throw lifecycle. A drum may drop one on
 * death; a player grabs a nearby one (spacebar, empty-handed) to carry it over
 * their head, then hurls it (spacebar again) along their facing. It flies as a
 * {@link ProjectileSystem} projectile and detonates where it lands: an instant
 * burst plus, for the molotov, a lingering {@link GroundZoneSystem} puddle.
 *
 * The carried item is a single replicated `Player.holding` flag; loose items on
 * the ground are replicated {@link Pickable} entities that despawn if left.
 */
export class PickableSystem {
  /** Loose pickables on the ground: id → sim-time (ms) it despawns at. */
  private readonly groundTtl = new Map<string, number>();
  private seq = 0;

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
    private readonly projectiles: ProjectileSystem,
    private readonly groundZones: GroundZoneSystem,
  ) {}

  /** Roll for a drop when a drum is destroyed: a 50% chance to spawn a molotov at
   *  the drum's position (grenades don't drop from drums). */
  spawnFromDrum(x: number, z: number): void {
    if (Math.random() >= PICKABLE_DROP_CHANCE) return;
    this.spawnGround('molotov', x, z);
  }

  /** Create a loose pickable on the ground (replicated + TTL-tracked). */
  private spawnGround(kind: PickableKind, x: number, z: number): void {
    const obj = new Pickable();
    obj.id = `pk${this.seq++}`;
    obj.kind = kind;
    obj.x = x;
    obj.y = PICKABLE_GROUND_Y;
    obj.z = z;
    this.ctx.state.pickables.set(obj.id, obj);
    this.groundTtl.set(obj.id, this.ctx.now() + PICKABLE_GROUND_TTL_MS);
  }

  /** Spacebar action: throw the carried object, or (empty-handed) grab the nearest
   *  one in reach. Returns true if anything happened. */
  interact(player: Player): boolean {
    if (player.holding) return this.throwHeld(player);
    return this.tryPickup(player);
  }

  /** Grab the closest loose pickable within reach (no-op if none / already holding). */
  private tryPickup(player: Player): boolean {
    if (player.holding) return false;
    let bestId: string | null = null;
    let bestSq = PICKABLE_PICKUP_RADIUS * PICKABLE_PICKUP_RADIUS;
    this.ctx.state.pickables.forEach((p, id) => {
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestSq) {
        bestSq = d2;
        bestId = id;
      }
    });
    if (!bestId) return false;
    const picked = this.ctx.state.pickables.get(bestId);
    if (!picked) return false;
    player.holding = picked.kind;
    this.ctx.state.pickables.delete(bestId);
    this.groundTtl.delete(bestId);
    return true;
  }

  /** Hurl the carried object along the player's facing; it detonates on impact. */
  private throwHeld(player: Player): boolean {
    if (!isPickableKind(player.holding)) {
      player.holding = '';
      return false;
    }
    const kind = player.holding;
    const def = PICKABLES[kind];
    player.holding = '';
    // Movement facing = the player's body rotation (yaw).
    const dirX = Math.sin(player.rotation);
    const dirZ = Math.cos(player.rotation);
    const fromId = player.sessionId;
    this.projectiles.spawnThrown(
      player,
      kind,
      dirX,
      dirZ,
      def.throwSpeed,
      def.throwRange,
      def.projectileRadius,
      (x, z) => this.detonate(kind, x, z, fromId),
    );
    return true;
  }

  /** Resolve a thrown pickable's impact at (x,z): the burst, then (molotov) the
   *  lingering puddle. Damages enemies of `fromId` (the thrower is excluded). */
  private detonate(kind: PickableKind, x: number, z: number, fromId: string): void {
    const def = PICKABLES[kind];
    const { radius, damage } = def.impact;
    this.ctx.broadcast(ServerMessage.Detonation, { kind, x, z, radius });
    // Instant burst on everyone in range (like any AoE — thrower excluded).
    this.combat.forEachEnemyInRadius(x, z, radius, fromId, (enemy) =>
      this.combat.dealDamage(enemy, damage, fromId),
    );
    // The blast also reacts with the props: shove/chip drums + tires, launch
    // barrels, and chip cover structures.
    this.combat.pushDestructiblesInRadius(x, z, radius, fromId, damage);
    this.combat.triggerBarrelsInRadius(x, z, radius, fromId);
    this.combat.effectRuntime.damageStructuresInRadius(x, z, radius, damage);
    // Molotov: leave a burning puddle that ticks over its lifetime.
    if (def.puddle) {
      const p = def.puddle;
      this.groundZones.spawn('molotov_fire', x, z, p.radius, p.tickDamage, p.tickMs, p.durationMs, fromId);
    }
  }

  /** Per-tick processing: despawn loose pickables nobody grabbed in time. */
  update(): void {
    const now = this.ctx.now();
    for (const [id, expireAt] of [...this.groundTtl]) {
      if (now >= expireAt) {
        this.ctx.state.pickables.delete(id);
        this.groundTtl.delete(id);
      }
    }
  }
}
