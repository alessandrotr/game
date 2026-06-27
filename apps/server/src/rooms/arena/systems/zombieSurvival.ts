import {
  ALTAR_ASSET_ID,
  ALTAR_GEM_COUNT,
  ALTAR_HEIGHT,
  ALTAR_POSITION,
  ALTAR_RADIUS,
  ALTAR_RITUAL_RADIUS,
  ARENA_PORTAL_POINT,
  PLAYER_RADIUS,
  RITUAL_CHANNEL_MS,
  RITUAL_MANA_DRAIN_PER_SEC,
  RITUAL_RUSH_SPRINTERS,
  RITUAL_SLOW_MAGNITUDE,
  RITUAL_SOLO_SHOCKWAVE_RADIUS,
  RITUAL_SOLO_SHOCKWAVE_STUN_MS,
  RITUAL_SOLO_SPRINTERS,
  SINGULARITY_DURATION_MS,
  SUPERWEAPON_CHARGES,
  SUPERWEAPON_ID,
  TITAN_SKIN_ID,
  titanHpForPlayers,
  ServerMessage,
  ZOMBIE_FAT_ATTACK_BONUS_MS,
  ZOMBIE_FAT_SKIN_ID,
  ZOMBIE_FAT_SPEED_PENALTY,
  ZOMBIE_MINIBOSS_SKIN_ID,
  ZOMBIE_SKIN_ID,
  ZOMBIE_SPAWN_PORTALS,
  ZOMBIE_SPEED_JITTER,
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_SPRINTER_SPAWN_CHANCE,
  ZOMBIE_SPRINTER_SPEED_MAX,
  ZOMBIE_SPRINTER_SPEED_MIN,
  ZOMBIE_WANDER_REROLL_MAX_MS,
  ZOMBIE_WANDER_REROLL_MIN_MS,
  clampToUnlockedArea,
  collideObstacles,
  generateSectionCover,
  isBlinded,
  isStunned,
  pickWeightedPortal,
  pondObstacles,
  trapForSection,
  zombieFatChanceForLevel,
  zombieFatHealthForLevel,
  zombieHealthForLevel,
  zombieMaxAlive,
  zombieSprinterHealthForLevel,
  type AbilityKind,
  type ArenaObstacle,
  type RoomLayout,
} from '@arena/shared';
import { Player, type ArenaState } from '../../schema.js';
import { clamp } from '../../util/locomotion.js';
import type { BarrelSystem } from './barrels.js';
import { makeZombieProfile, type BotProfile } from './bots.js';
import type { CombatSystem } from './combat.js';
import type { CoverSystem } from './cover.js';
import type { DestructibleSystem } from './destructibles.js';
import type { GroundZoneSystem } from './groundZones.js';
import type { ProjectileSystem } from './projectiles.js';
import type { TrapSystem } from './traps.js';

/** Per-zombie movement personality: a spawn-rolled speed offset (±jitter) and a
 *  lateral chase-wander bias that re-rolls on its own clock, plus stuck-detection
 *  bookkeeping — so a horde spreads + flanks instead of trailing in a line. */
export interface ZombieAiState {
  speedOffset: number;
  wander: number;
  wanderUntil: number;
  attackBonusMs: number;
  /** Last chase position + consecutive near-stationary ticks while out of range. */
  lastX: number;
  lastZ: number;
  stuckTicks: number;
  /** While `simTime < detourUntil`, steer a forced ~perpendicular heading
   *  (sign = `detourSide`) to escape the obstacle instead of re-ramming it. */
  detourUntil: number;
  detourSide: number;
}

/** The bits of room state the zombie logic reads/writes — handed in by the room
 *  (by reference / as closures) so this module needs none of the room's
 *  internals directly. Maps are shared by reference (mutations are seen by both). */
export interface ZombieSurvivalDeps {
  now: () => number;
  state: ArenaState;
  bots: Map<string, BotProfile>;
  verticalVelocity: Map<string, number>;
  grounded: Map<string, boolean>;
  cooldowns: Map<string, Partial<Record<AbilityKind, number>>>;
  /** Who each bot is currently chasing (shared with the room's AI). */
  attackTargets: Map<string, string>;
  /** Arena half-extents (used to clamp spawns + shoves inside the walls). */
  arenaLimit: number;
  arenaLimitZ: number;
  /** This tick's cover+prop circles (rebuilt each tick by the room, shared by
   *  reference) — used to re-resolve zombies shoved into an obstacle. */
  zombieStaticObstacles: ArenaObstacle[];
  /** Allocate the next unique bot sequence number (the room owns the counter). */
  nextBotId: () => number;
  /** Reset a freshly-built bot to spawn defaults (shared room logic). */
  resetPlayer: (player: Player) => void;
  /** The match's room-expansion layout, or null before/without it. */
  roomLayout: () => RoomLayout | null;
  /** Gameplay systems the mini-boss + door-unlock logic drive. */
  combat: CombatSystem;
  projectiles: ProjectileSystem;
  cover: CoverSystem;
  barrels: BarrelSystem;
  destructibles: DestructibleSystem;
  traps: TrapSystem;
  groundZones: GroundZoneSystem;
  /** Replicate a server event to all clients (Colyseus `room.broadcast`). */
  broadcast: (type: string | number, message?: unknown) => void;
}

/**
 * Mode-specific logic for ZOMBIE SURVIVAL — behaviour that only exists in a horde
 * mode, kept out of the shared ArenaRoom sim. The room builds one only in zombie
 * mode and delegates to it.
 *
 * (Mini-boss AI, horde collision resolution and door unlocks move here next.)
 */
export class ZombieSurvival {
  /** Per-zombie AI personality, keyed by session id. */
  private readonly ai = new Map<string, ZombieAiState>();

  /** Next time (sim ms) each mini-boss may take a special action, keyed by id. */
  private readonly bossNextActionAt = new Map<string, number>();

  /** Resonance of the Void: true once the Altar of Resonance has been placed. */
  private altarSpawned = false;

  constructor(private readonly deps: ZombieSurvivalDeps) {}

  // --- Resonance of the Void: end-game altar -------------------------------

  /** Place the Altar of Resonance at the room centre, once. A solid, indestructible
   *  obelisk (a CoverStructure → static-cylinder collider, so players/zombies path
   *  around it); (0,0) is empty in the zombie room so it never overlaps fixed cover.
   *  Idempotent — safe to call every wave from {@link ALTAR_SPAWN_WAVE} on. */
  ensureAltar(): void {
    if (this.altarSpawned) return;
    this.altarSpawned = true;

    // Clear any cover structures, barrels, and destructibles in the Altar's path.
    const clearRadius = 3.5;
    // Destroy CoverStructures in range (deal massive damage so they crumble)
    this.deps.cover.damageInRadius(ALTAR_POSITION.x, ALTAR_POSITION.z, clearRadius, 99999);
    // Explode any barrels in range
    this.deps.barrels.triggerInRadius(ALTAR_POSITION.x, ALTAR_POSITION.z, clearRadius, '');
    // Destroy any destructible props in range (drums, tires)
    this.deps.destructibles.pushInRadius(ALTAR_POSITION.x, ALTAR_POSITION.z, clearRadius, '', 99999);

    // Spawn the Pond obstacles (collisions) on the server.
    this.deps.cover.addObstacles(pondObstacles());

    this.deps.cover.addSection([
      {
        assetId: ALTAR_ASSET_ID,
        x: ALTAR_POSITION.x,
        z: ALTAR_POSITION.z,
        rotation: 0,
        radius: ALTAR_RADIUS,
        height: ALTAR_HEIGHT,
        maxHp: 9999,
        indestructible: true,
        lengthScale: 1,
      },
    ]);
  }

  // --- Resonance of the Void: the claiming ritual --------------------------

  /** Active ritual channels, keyed by channeller session id. */
  private readonly rituals = new Map<string, { startAt: number; solo: boolean }>();

  /** True while this player is channelling the altar ritual (regen is suppressed
   *  for them in the room loop so the drain actually bites). */
  isRitualing(id: string): boolean {
    return this.rituals.has(id);
  }

  /** True if (x,z) is inside the altar's walkable ritual ring. */
  private inRitualZone(x: number, z: number): boolean {
    const dx = x - ALTAR_POSITION.x;
    const dz = z - ALTAR_POSITION.z;
    return dx * dx + dz * dz <= ALTAR_RITUAL_RADIUS * ALTAR_RITUAL_RADIUS;
  }

  /** Try to begin the claiming ritual. Validates all gates and, on success, pays
   *  the sacrifice (multi: silence + slow the channeller; solo: an opening
   *  shockwave instead) and rushes Sprinters at the channeller. Returns whether
   *  it started. */
  startRitual(id: string): boolean {
    if (this.rituals.has(id)) return true;
    const player = this.deps.state.players.get(id);
    if (!player || !player.alive || player.superweapon) return false;
    // Gates: all 4 gems lit, a wave in progress (altar is silent between waves),
    // and standing inside the ritual ring.
    if ((this.deps.state.altarGemsLit & 15) !== 15) return false;
    if (this.deps.state.zombiesRemaining <= 0) return false;
    if (!this.inRitualZone(player.x, player.z)) return false;
    // Regen is suppressed during the channel, so the full cost must be banked or
    // the drain would break it mid-way: 4s × 20/s = 80 mana.
    const cost = (RITUAL_CHANNEL_MS / 1000) * RITUAL_MANA_DRAIN_PER_SEC;
    if (player.mana < cost) return false;

    const solo = this.countHumans() <= 1;
    this.rituals.set(id, { startAt: this.deps.now(), solo });
    // Reuse the replicated channel field so peers see the wind-up pose/VFX.
    player.channelAbility = 'ritual';
    player.channelDirX = 0;
    player.channelDirZ = 1;

    if (solo) {
      // Solo: no silence; an opening shockwave knocks back + stuns nearby zombies.
      this.deps.combat.forEachEnemyInRadius(
        player.x,
        player.z,
        RITUAL_SOLO_SHOCKWAVE_RADIUS,
        id,
        (enemy) => {
          this.deps.combat.applyStatus(
            enemy,
            { kind: 'stun', durationMs: RITUAL_SOLO_SHOCKWAVE_STUN_MS },
            id,
          );
          const ex = enemy.x - player.x;
          const ez = enemy.z - player.z;
          const d = Math.hypot(ex, ez) || 1;
          this.deps.combat.displace(enemy, ex / d, ez / d, 4, 18, 0, id);
        },
      );
      this.deps.broadcast(ServerMessage.AbilityCast, {
        casterId: id,
        ability: 'ground_slam',
        x: player.x,
        y: 0.05,
        z: player.z,
        dirX: 0,
        dirZ: 1,
      });
    } else {
      // Multi-player sacrifice: silenced + 50% slowed for the channel duration.
      this.deps.combat.applyStatus(player, { kind: 'silence', durationMs: RITUAL_CHANNEL_MS }, '');
      this.deps.combat.applyStatus(
        player,
        { kind: 'slow', durationMs: RITUAL_CHANNEL_MS, magnitude: RITUAL_SLOW_MAGNITUDE },
        '',
      );
    }

    // Rush Sprinters that prioritise the channeller (scaled down when solo).
    const count = solo ? RITUAL_SOLO_SPRINTERS : RITUAL_RUSH_SPRINTERS;
    for (let i = 0; i < count; i++) this.spawnRushSprinter(id);
    return true;
  }

  /** Stop a ritual (player released the key, was interrupted, or it completed).
   *  Clears the wind-up + the multi-player sacrifice statuses. */
  stopRitual(id: string): void {
    if (!this.rituals.delete(id)) return;
    const player = this.deps.state.players.get(id);
    if (player && player.channelAbility === 'ritual') {
      player.channelAbility = '';
      this.deps.combat.removeStatuses(player, 'silence');
      this.deps.combat.removeStatuses(player, 'slow');
    }
  }

  /** Per-tick: drain the channeller's mana, enforce the stay-in-ring rule (solo),
   *  break on death/stun/empty mana, and grant the superweapon on completion. */
  updateRituals(dt: number): void {
    if (this.rituals.size === 0) return;
    const now = this.deps.now();
    for (const [id, r] of this.rituals) {
      const player = this.deps.state.players.get(id);
      if (!player || !player.alive || isStunned(player)) {
        this.stopRitual(id);
        continue;
      }
      player.mana = Math.max(0, player.mana - RITUAL_MANA_DRAIN_PER_SEC * dt);
      if (player.mana <= 0) {
        this.stopRitual(id);
        continue;
      }
      // Solo channellers must stay inside the ring — stepping out cancels.
      if (r.solo && !this.inRitualZone(player.x, player.z)) {
        this.stopRitual(id);
        continue;
      }
      if (now - r.startAt >= RITUAL_CHANNEL_MS) {
        player.superweapon = SUPERWEAPON_ID;
        player.soulCharges = SUPERWEAPON_CHARGES;
        this.stopRitual(id);
      }
    }
  }

  /** Spawn one Sprinter that beelines for `targetId` (the ritual rush). Mirrors
   *  {@link spawnZombie}'s Sprinter variant but forces the variant + chase target. */
  private spawnRushSprinter(targetId: string): void {
    const level = this.deps.state.zombieLevel;
    if (this.deps.bots.size >= zombieMaxAlive(level) + 24) return;
    const id = `zombie-${this.deps.nextBotId()}`;
    const player = new Player();
    player.sessionId = id;
    player.name = 'Sprinter';
    player.characterClass = 'warrior';
    player.skinId = ZOMBIE_SPRINTER_SKIN_ID;
    player.team = 'red';
    this.deps.resetPlayer(player);
    const limit = this.deps.arenaLimit - PLAYER_RADIUS;
    const jitter = () => (Math.random() * 2 - 1) * 1.6;
    const portal = this.pickPortal();
    player.x = clamp(portal.x + jitter(), -limit, limit);
    player.z = clamp(portal.z + jitter(), -limit, limit);
    player.maxHp = zombieSprinterHealthForLevel(level);
    player.hp = player.maxHp;
    this.deps.state.players.set(id, player);
    this.deps.verticalVelocity.set(id, 0);
    this.deps.grounded.set(id, true);
    this.deps.cooldowns.set(id, {});
    this.deps.bots.set(id, makeZombieProfile());
    const ai = this.aiFor(id);
    ai.speedOffset =
      ZOMBIE_SPRINTER_SPEED_MIN +
      Math.random() * (ZOMBIE_SPRINTER_SPEED_MAX - ZOMBIE_SPRINTER_SPEED_MIN);
    // Lock onto the channeller so the rush converges on them.
    this.deps.attackTargets.set(id, targetId);
  }

  // --- Per-zombie AI personality -------------------------------------------

  /** Get (or lazily roll, once) a zombie's AI personality. */
  aiFor(id: string): ZombieAiState {
    let ai = this.ai.get(id);
    if (!ai) {
      ai = {
        speedOffset: (Math.random() * 2 - 1) * ZOMBIE_SPEED_JITTER,
        // Commit to a flank side (±) at spawn with a 0.55–1.0 arc magnitude — half
        // the horde curls left, half right, so they encircle instead of trailing.
        wander: (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.45),
        wanderUntil: this.deps.now() + this.rollWanderInterval(),
        attackBonusMs: 0,
        lastX: 0,
        lastZ: 0,
        stuckTicks: 0,
        detourUntil: 0,
        detourSide: 1,
      };
      this.ai.set(id, ai);
    }
    return ai;
  }

  /** Drop a (removed) zombie's personality so a recycled id re-rolls fresh. */
  forget(id: string): void {
    this.ai.delete(id);
  }

  /** A randomized gap until a zombie next re-picks its wander path. */
  rollWanderInterval(): number {
    return (
      ZOMBIE_WANDER_REROLL_MIN_MS +
      Math.random() * (ZOMBIE_WANDER_REROLL_MAX_MS - ZOMBIE_WANDER_REROLL_MIN_MS)
    );
  }

  /** Choose a spawn portal for a new zombie: a random fixed gate before the room
   *  expands, else a distance-weighted pick across the unlocked sections' portals
   *  (so hordes pour from gates near the players). */
  pickPortal(): { x: number; z: number } {
    const layout = this.deps.roomLayout();
    if (!layout || this.deps.state.unlockedSections === 0) {
      return (
        ZOMBIE_SPAWN_PORTALS[Math.floor(Math.random() * ZOMBIE_SPAWN_PORTALS.length)] ??
        ARENA_PORTAL_POINT
      );
    }
    const humans: { x: number; z: number }[] = [];
    this.deps.state.players.forEach((p, id) => {
      if (p.alive && !this.deps.bots.has(id)) humans.push({ x: p.x, z: p.z });
    });
    return pickWeightedPortal(ZOMBIE_SPAWN_PORTALS, layout, this.deps.state.unlockedSections, humans);
  }

  // --- Counts (read by the wave director) ----------------------------------

  /** Human (non-bot) players present. */
  countHumans(): number {
    let n = 0;
    this.deps.state.players.forEach((_player, id) => {
      if (!this.deps.bots.has(id)) n += 1;
    });
    return n;
  }

  /** Zombies currently alive (corpses awaiting removal are excluded). */
  countAliveZombies(): number {
    let n = 0;
    this.deps.bots.forEach((_profile, id) => {
      if (this.deps.state.players.get(id)?.alive) n += 1;
    });
    return n;
  }

  // --- Spawning ------------------------------------------------------------

  /** Spawn one zombie for `level`: a red-team melee bot that pours out of a
   *  portal with level-scaled health and a relentless-chaser AI profile. The
   *  shared sim (auto-attack chase) + BotDirector drive the rest. */
  spawnZombie(level: number): void {
    // Hard backstop above the director's own (level-scaled) cap — corpses can
    // briefly inflate the map — so a bug can never let zombies grow without bound.
    if (this.deps.bots.size >= zombieMaxAlive(level) + 24) return;
    // Roll this horde slot's variant: a Sprinter (fast, fragile), a Fat (slow,
    // tanky, quicker swings), or a normal zombie. One roll partitions the chances
    // so each variant keeps its exact marginal probability.
    const roll = Math.random();
    const fatChance = zombieFatChanceForLevel(level);
    const variant: 'sprinter' | 'fat' | 'normal' =
      roll < ZOMBIE_SPRINTER_SPAWN_CHANCE
        ? 'sprinter'
        : roll < ZOMBIE_SPRINTER_SPAWN_CHANCE + fatChance
          ? 'fat'
          : 'normal';

    const id = `zombie-${this.deps.nextBotId()}`;
    const player = new Player();
    player.sessionId = id;
    player.name = variant === 'sprinter' ? 'Sprinter' : variant === 'fat' ? 'Fat' : 'Zombie';
    player.characterClass = 'warrior'; // melee auto-attack (drives stats/attacks)
    player.skinId =
      variant === 'sprinter'
        ? ZOMBIE_SPRINTER_SKIN_ID
        : variant === 'fat'
          ? ZOMBIE_FAT_SKIN_ID
          : ZOMBIE_SKIN_ID;
    player.team = 'red';
    this.deps.resetPlayer(player);
    // Override the team spawn with a portal mouth (+ jitter so a pulse fans out
    // instead of stacking), then apply the variant's level-scaled health.
    const limit = this.deps.arenaLimit - PLAYER_RADIUS;
    const jitter = () => (Math.random() * 2 - 1) * 1.6;
    const portal = this.pickPortal();
    player.x = clamp(portal.x + jitter(), -limit, limit);
    player.z = clamp(portal.z + jitter(), -limit, limit);
    player.maxHp =
      variant === 'sprinter'
        ? zombieSprinterHealthForLevel(level)
        : variant === 'fat'
          ? zombieFatHealthForLevel(level)
          : zombieHealthForLevel(level);
    player.hp = player.maxHp;

    this.deps.state.players.set(id, player);
    this.deps.verticalVelocity.set(id, 0);
    this.deps.grounded.set(id, true);
    this.deps.cooldowns.set(id, {});
    this.deps.bots.set(id, makeZombieProfile());
    const ai = this.aiFor(id); // roll this zombie's speed/wander personality
    if (variant === 'sprinter') {
      // A Sprinter's speed offset IS its bonus over a same-level zombie (2–3 u/s).
      ai.speedOffset =
        ZOMBIE_SPRINTER_SPEED_MIN +
        Math.random() * (ZOMBIE_SPRINTER_SPEED_MAX - ZOMBIE_SPRINTER_SPEED_MIN);
    } else if (variant === 'fat') {
      // A Fat is slower than a same-level zombie and swings a touch sooner.
      ai.speedOffset = -ZOMBIE_FAT_SPEED_PENALTY;
      ai.attackBonusMs = ZOMBIE_FAT_ATTACK_BONUS_MS;
    }
  }

  /** Spawn the wave's Mini-Boss: a slow, very tanky red bot with special actions
   *  (driven by the room's mini-boss AI). */
  spawnMiniBoss(): void {
    const id = `zombie-miniboss-${this.deps.nextBotId()}`;
    const player = new Player();
    player.sessionId = id;
    player.name = 'Mini Boss';
    player.characterClass = 'warrior';
    player.skinId = ZOMBIE_MINIBOSS_SKIN_ID;
    player.team = 'red';
    this.deps.resetPlayer(player);

    const limit = this.deps.arenaLimit - 0.8;
    const portal = this.pickPortal();
    player.x = clamp(portal.x + (Math.random() * 2 - 1) * 1.6, -limit, limit);
    player.z = clamp(portal.z + (Math.random() * 2 - 1) * 1.6, -limit, limit);

    player.maxHp = 750;
    player.hp = 750;

    this.deps.state.players.set(id, player);
    this.deps.verticalVelocity.set(id, 0);
    this.deps.grounded.set(id, true);
    this.deps.cooldowns.set(id, {});
    this.deps.bots.set(id, makeZombieProfile());

    const ai = this.aiFor(id);
    ai.speedOffset = -1.5; // slow movement
  }

  // --- Per-tick horde resolution -------------------------------------------

  /** After movement, separate overlapping zombies and shove them out of humans
   *  and obstacles — so a horde packs around a target instead of stacking into a
   *  single point, and nobody clips through cover or into a locked section. */
  resolveZombieCollisions(): void {
    const zombies: Player[] = [];
    this.deps.bots.forEach((_profile, id) => {
      const z = this.deps.state.players.get(id);
      if (z?.alive) zombies.push(z);
    });
    if (zombies.length === 0) return;

    const startPos = new Map<string, { x: number; z: number }>();
    for (const z of zombies) {
      startPos.set(z.sessionId, { x: z.x, z: z.z });
    }

    // Zombie ↔ zombie: push apart equally (a deterministic axis when exactly
    // coincident, e.g. two spawned on the same jittered point).
    for (let i = 0; i < zombies.length; i++) {
      const a = zombies[i]!;
      const aRadius = a.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
      for (let j = i + 1; j < zombies.length; j++) {
        const b = zombies[j]!;
        const bRadius = b.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
        const minSep = aRadius + bRadius;
        const minSepSq = minSep * minSep;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minSepSq) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          dx = i % 2 === 0 ? 1 : -1;
          dz = 0;
          d = 1;
        }
        const push = (minSep - d) / 2;
        const ox = (dx / d) * push;
        const oz = (dz / d) * push;
        const aLimit = this.deps.arenaLimit - aRadius;
        const bLimit = this.deps.arenaLimit - bRadius;
        const aLimitZ = this.deps.arenaLimitZ - aRadius;
        const bLimitZ = this.deps.arenaLimitZ - bRadius;
        a.x = clamp(a.x - ox, -aLimit, aLimit);
        a.z = clamp(a.z - oz, -aLimitZ, aLimitZ);
        b.x = clamp(b.x + ox, -bLimit, bLimit);
        b.z = clamp(b.z + oz, -bLimitZ, bLimitZ);
      }
    }

    // Zombie ↔ human: shove the zombie fully out (leave the human put).
    this.deps.state.players.forEach((human, id) => {
      if (this.deps.bots.has(id) || !human.alive) return;
      const humanRadius = PLAYER_RADIUS;
      for (const z of zombies) {
        const zRadius = z.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
        const minSep = humanRadius + zRadius;
        const minSepSq = minSep * minSep;
        const dx = z.x - human.x;
        const dz = z.z - human.z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 >= minSepSq || dist2 < 1e-8) continue;
        const d = Math.sqrt(dist2);
        const push = minSep - d;
        const zLimit = this.deps.arenaLimit - zRadius;
        z.x = clamp(z.x + (dx / d) * push, -zLimit, zLimit);
        z.z = clamp(z.z + (dz / d) * push, -zLimit, zLimit);
      }
    });

    // Re-resolve cover and prop collisions for any zombie nudged into an obstacle.
    // Reuses the cover+prop list built once for this tick by the room (props move
    // only in the later physics step, so it's still current here).
    const zombieStaticObstacles = this.deps.zombieStaticObstacles;
    const layout = this.deps.roomLayout();

    for (const z of zombies) {
      const zRadius = z.skinId === ZOMBIE_MINIBOSS_SKIN_ID ? 0.8 : PLAYER_RADIUS;
      const fixed = collideObstacles(z.x, z.z, zombieStaticObstacles, zRadius);
      z.x = fixed.x;
      z.z = fixed.z;
      // Enforce section boundaries so pushed zombies can't end up in locked areas.
      if (layout) {
        const start = startPos.get(z.sessionId) ?? { x: z.x, z: z.z };
        const clamped = clampToUnlockedArea(
          z.x,
          z.z,
          layout,
          this.deps.state.unlockedSections,
          zRadius,
          start.x,
          start.z,
        );
        z.x = clamped.x;
        z.z = clamped.z;
      }
    }
  }

  // --- Mini-boss AI --------------------------------------------------------

  /** Drive one mini-boss: on its own cooldown, re-acquire a target then unleash
   *  either a 5-way fireball burst or a stomp shockwave (damage + slow + shove). */
  updateMiniBossAI(bot: Player, id: string): void {
    if (isStunned(bot) || isBlinded(bot)) return;
    if (this.deps.now() < (this.bossNextActionAt.get(id) ?? 0)) return;

    // Mini-boss target
    const targetId = this.deps.attackTargets.get(id);
    const target = targetId ? this.deps.state.players.get(targetId) : undefined;
    if (!target || !target.alive) {
      // Re-evaluate target or try to find the closest player
      let bestTarget: Player | undefined;
      let minD2 = Infinity;
      this.deps.state.players.forEach((p) => {
        if (!p.alive || p.team === bot.team) return;
        const dx = p.x - bot.x;
        const dz = p.z - bot.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD2) {
          minD2 = d2;
          bestTarget = p;
        }
      });
      if (bestTarget) {
        this.deps.attackTargets.set(id, bestTarget.sessionId);
        this.bossNextActionAt.set(id, this.deps.now() + 500); // short wait to re-aim
      }
      return;
    }

    // Set next action timestamp (3.5 to 6s cooldown)
    const interval = 3500 + Math.random() * 2500;
    this.bossNextActionAt.set(id, this.deps.now() + interval);

    // Roll for action: 50% chance fireball, 50% chance stomp shockwave
    const roll = Math.random();
    if (roll < 0.5) {
      // 5-way Fireball burst
      const baseAngle = Math.atan2(target.x - bot.x, target.z - bot.z);
      for (let i = 0; i < 5; i++) {
        const angle = baseAngle + i * ((2 * Math.PI) / 5);
        const dirX = Math.sin(angle);
        const dirZ = Math.cos(angle);

        // Spawn fireball projectile (3x slower velocity: 15 instead of 45)
        this.deps.projectiles.spawnProjectile(bot, 'fireball', dirX, dirZ, 15, 30, 1.0, [
          { type: 'damage', amount: 20 },
        ]);
      }
    } else {
      // Stomp shockwave: circular shockwave hitting everyone in a 7.0 unit radius, dealing 25 damage and knocking them back.
      this.deps.combat.forEachEnemyInRadius(bot.x, bot.z, 7.0, id, (enemy) => {
        this.deps.combat.dealDamage(enemy, 25, id);
        this.deps.combat.applyStatus(enemy, { kind: 'slow', durationMs: 2000, magnitude: 0.6 }, id);
        const dx = enemy.x - bot.x;
        const dz = enemy.z - bot.z;
        const dist = Math.hypot(dx, dz) || 1;
        this.deps.combat.displace(enemy, dx / dist, dz / dist, 4, 18, 0, id);
      });
      // Play ground slam VFX on clients
      this.deps.broadcast(ServerMessage.AbilityCast, {
        casterId: id,
        ability: 'ground_slam',
        x: bot.x,
        y: 0.05,
        z: bot.z,
        dirX: 0,
        dirZ: 1,
      });
    }
  }

  // --- Resonance of the Void: the Necrotic Titan ---------------------------

  /** True once the Titan has been spawned this run (it only ever spawns once). */
  private titanSpawned = false;

  /** Spawn the Necrotic Titan (wave 16). A colossal, CC-immune boss zombie whose
   *  HP scales with the human count. Returns whether it actually spawned (false if
   *  one already exists) so the caller can freeze the normal horde exactly once. */
  spawnTitan(): boolean {
    if (this.titanSpawned) return false;
    this.titanSpawned = true;
    const id = `zombie-titan-${this.deps.nextBotId()}`;
    const player = new Player();
    player.sessionId = id;
    player.name = 'Necrotic Titan';
    player.characterClass = 'warrior';
    player.skinId = TITAN_SKIN_ID;
    player.team = 'red';
    this.deps.resetPlayer(player);
    const limit = this.deps.arenaLimit - 1.5;
    const portal = this.pickPortal();
    player.x = clamp(portal.x, -limit, limit);
    player.z = clamp(portal.z, -limit, limit);
    const hp = titanHpForPlayers(this.countHumans());
    player.maxHp = hp;
    player.hp = hp;
    this.deps.state.players.set(id, player);
    this.deps.verticalVelocity.set(id, 0);
    this.deps.grounded.set(id, true);
    this.deps.cooldowns.set(id, {});
    this.deps.bots.set(id, makeZombieProfile());
    this.aiFor(id).speedOffset = -3.5; // ponderous (decreased by 1.5 from -2.0)
    return true;
  }

  /** Drive the Necrotic Titan: alternating Decimating Fissure (a forward fan
   *  of shockwaves) and Corrosive Mortar (acid pools around the target). */
  updateTitanAI(bot: Player, id: string): void {
    if (this.deps.now() < (this.bossNextActionAt.get(id) ?? 0)) return;

    // Acquire the nearest living human.
    let target: Player | undefined;
    let minD2 = Infinity;
    this.deps.state.players.forEach((p, pid) => {
      if (!p.alive || this.deps.bots.has(pid)) return;
      const dx = p.x - bot.x;
      const dz = p.z - bot.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) {
        minD2 = d2;
        target = p;
      }
    });
    if (!target) {
      this.bossNextActionAt.set(id, this.deps.now() + 1000);
      return;
    }

    // Cooldown/interval doubled: from (3-5s) to (6-10s)
    this.bossNextActionAt.set(id, this.deps.now() + (6000 + Math.random() * 4000));

    if (Math.random() < 0.5) {
      // Decimating Fissure: three heavy shockwaves in a tight forward fan.
      const base = Math.atan2(target.x - bot.x, target.z - bot.z);
      for (const off of [-0.25, 0, 0.25]) {
        const a = base + off;
        this.deps.projectiles.spawnProjectile(bot, 'fireball', Math.sin(a), Math.cos(a), 18, 40, 1.4, [
          { type: 'damage', amount: 45 },
        ]);
      }
      this.deps.broadcast(ServerMessage.AbilityCast, {
        casterId: id,
        ability: 'ground_slam',
        x: bot.x,
        y: 0.05,
        z: bot.z,
        dirX: 0,
        dirZ: 1,
      });
    } else {
      // Corrosive Mortar: three acid pools (high-DoT fire fields) around the target.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.random();
        const px = target.x + Math.cos(a) * 4;
        const pz = target.z + Math.sin(a) * 4;
        this.deps.groundZones.spawn('molotov_fire', px, pz, 3.5, 25, 500, 8000, id);
      }
    }
  }

  // --- Room expansion ------------------------------------------------------

  /** If `level` matches the next door's unlock wave, open that door and load the
   *  section behind it (cover + barrels + props + an optional trap). No-op if all
   *  doors are already open or the wave hasn't reached the next door yet. */
  tryUnlockDoor(level: number): void {
    const layout = this.deps.roomLayout();
    if (!layout) {
      console.log(`[doors] tryUnlockDoor(${level}): no roomLayout — skipping`);
      return;
    }
    const nextIndex = this.deps.state.unlockedSections;
    if (nextIndex >= layout.doors.length) return;
    const door = layout.doors[nextIndex]!;
    if (level < door.unlockWave) {
      console.log(
        `[doors] tryUnlockDoor(${level}): wave ${level} < required ${door.unlockWave} for door ${door.index}`,
      );
      return;
    }

    console.log(
      `[doors] UNLOCKING door ${door.index} at (${door.x}, ${door.z}) — wave ${level}, width ${door.width}`,
    );

    // Remove the door's wall from the collision set.
    this.deps.cover.removeDoor(`door-${door.index}`);

    // Generate cover for the newly unlocked section.
    const section = layout.sections[nextIndex];
    if (section) {
      // Compute the section's trap up front so cover generation can reserve its
      // area (nothing spawns on a trap) — the client mirrors this exact call so
      // both layouts agree.
      const trap = trapForSection(this.deps.state.layoutSeed, section);
      const sectionCover = generateSectionCover(this.deps.state.layoutSeed, section, trap);
      this.deps.cover.addSection(sectionCover.structures);
      this.deps.barrels.addBarrels(sectionCover.barrels);
      this.deps.destructibles.addObjects(sectionCover.drums, sectionCover.tireStacks);
      console.log(
        `[doors] Section ${section.name} loaded: ${sectionCover.structures.length} structures, ${sectionCover.barrels.length} barrels`,
      );

      if (trap) {
        this.deps.traps.addTrap(trap);
        console.log(`[traps] ${trap.kind} trap placed in ${section.name} at (${trap.x}, ${trap.z})`);
      }
    }

    // Increment the replicated counter (drives client rendering + minimap).
    this.deps.state.unlockedSections = nextIndex + 1;
    console.log(`[doors] unlockedSections now = ${this.deps.state.unlockedSections}`);

    // Broadcast a door-open event so clients play the crumble VFX.
    this.deps.broadcast(ServerMessage.StructureCrumbled, {
      x: door.x,
      z: door.z,
      radius: door.width / 2,
    });
  }
}
