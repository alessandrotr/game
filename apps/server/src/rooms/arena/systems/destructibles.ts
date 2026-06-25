import { type RigidBody } from '@dimforge/rapier3d-compat';
import {
  DAMAGE_COOLDOWN_MS,
  DESTRUCTIBLE_CONFIG,
  DRUM_HALF_HEIGHT,
  DRUM_HP,
  IMPACT_DAMAGE_TO_PLAYER,
  MIN_DAMAGE_VELOCITY,
  PLAYER_RADIUS,
  TIRE_STACK_COUNT,
  TIRE_STACK_SPACING,
  TIRE_TUBE,
  TIRE_HP,
  clampToUnlockedArea,
  randomSpawnPoint,
  type DestructibleCategory,
  type DestructibleCategoryConfig,
  type DestructibleKind,
  type RoomLayout,
} from '@arena/shared';

// --- Zombie-mode oil-drum respawn (mirrors the burning-barrel respawn) --------
/** Smallest wave (also the main-room baseline). */
const DRUM_RESPAWN_MIN_COUNT = 2;
/** Largest wave, reached once the whole arena is unlocked. */
const DRUM_RESPAWN_MAX_COUNT = 8;
/** Min/max delay (ms) between drum respawn waves. */
const DRUM_RESPAWN_MIN_MS = 15_000;
const DRUM_RESPAWN_MAX_MS = 25_000;
/** Empty radius reserved at each wing's centre for a future structure. */
const CENTER_RESERVE = 6;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
import { DestructibleObject } from '../../schema.js';
import type { ArenaContext } from '../context.js';
import type { CombatSystem } from './combat.js';
import type { ArenaPhysics } from './physics.js';

/** Server-only physics handle + bookkeeping for one destructible. The replicated
 *  transform lives on {@link DestructibleObject}; the authoritative motion is the
 *  Rapier {@link RigidBody}. */
interface Body {
  obj: DestructibleObject;
  rb: RigidBody;
  category: DestructibleCategory;
  cfg: DestructibleCategoryConfig;
  /** Horizontal footprint radius (player-impact checks). */
  radius: number;
  /** Last player to launch it (impact-damage credit). */
  fromId: string;
  /** Per-player impact-damage cooldown: player id → sim ms next hit allowed. */
  dmgReadyAt: Map<string, number>;
  /** Tire stacks react to a spell only ONCE — `spent` makes them inert after. */
  spent: boolean;
  /** Drums can be hit repeatedly; this gates re-impulses (sim ms). */
  hitReadyAt: number;
  /** Remaining hit points. Drums start at {@link DRUM_HP} and tires start at {@link TIRE_HP}, and they are destroyed at 0. */
  hp: number;
  /** Was awake last tick — lets us write one final transform when it sleeps. */
  wasAwake: boolean;
}

/**
 * Destructible environment objects — the "DestructibleManager".
 *
 * Runs a small, server-authoritative **Rapier** physics world for the arena's
 * destructible props: tire piles (three separate, physically-stacked tires) and
 * oil drums (the 3-at-a-time piles + loose ones). A spell impact applies a
 * clamped impulse slightly above the body's center, so it rolls/tumbles, falls
 * with real gravity, collides with cover and the floor, and settles — then
 * Rapier sleeps it. Each awake body's transform is replicated via the
 * {@link DestructibleObject} schema (clients render it; they run no physics, so
 * everyone sees the same result). A fast-moving body that strikes a player deals
 * a small impact damage. Nothing here explodes.
 */
export class DestructibleSystem {
  private readonly bodies = new Map<string, Body>();
  private seq = 0;
  private structureSeq = 0;
  /** Zombie mode: drums respawn back up to this count (the initial drum total). */
  private targetDrums = 0;
  /** Sim time (ms) the next drum respawn wave is due (zombie mode only). */
  private nextDrumRespawnAt = 0;
  /** Called when a drum is destroyed (HP ran out), with its position — lets the
   *  room roll for a pickable drop. Set via {@link onDrumDestroyed}. */
  private drumDestroyedCb?: (x: number, z: number) => void;
  /** The room layout — needed for cross-shape boundary clamping in zombie mode. */
  private roomLayout: RoomLayout | null = null;

  /** Register a callback fired whenever a drum is destroyed (at its position). */
  onDrumDestroyed(cb: (x: number, z: number) => void): void {
    this.drumDestroyedCb = cb;
  }

  /** Set the room layout for cross-shape boundary enforcement (zombie mode). */
  setRoomLayout(layout: RoomLayout): void {
    this.roomLayout = layout;
  }

  constructor(
    private readonly ctx: ArenaContext,
    private readonly combat: CombatSystem,
    private readonly physics: ArenaPhysics,
  ) {}

  // --- Spawning -------------------------------------------------------------

  /** Spawn the match's destructibles into the shared physics world: a 3-tire
   *  stack at each tire-stack center and a drum at each oil-drum position. */
  init(
    drumPositions: { x: number; y?: number; z: number }[],
    tireStackPositions: { x: number; z: number }[],
  ): void {
    this.bodies.clear();
    this.ctx.state.destructibles.clear();
    this.seq = 0;
    this.structureSeq = 0;
    for (const p of tireStackPositions) this.spawnTireStack(p.x, p.z);
    for (const p of drumPositions) this.spawnDrum(p.x, p.z, p.y);
    // Zombie mode keeps the map stocked: respawn destroyed drums back up to the
    // initial count, in waves, like the burning barrels.
    this.targetDrums = drumPositions.length;
    this.nextDrumRespawnAt = this.ctx.now() + this.randomDrumRespawnDelay();
  }

  private randomDrumRespawnDelay(): number {
    return DRUM_RESPAWN_MIN_MS + Math.random() * (DRUM_RESPAWN_MAX_MS - DRUM_RESPAWN_MIN_MS);
  }

  /** Append drums + tire stacks for a newly unlocked section (room expansion system). */
  addObjects(
    drumPositions: { x: number; y?: number; z: number }[],
    tireStackPositions: { x: number; z: number }[],
  ): void {
    for (const p of tireStackPositions) this.spawnTireStack(p.x, p.z);
    for (const p of drumPositions) this.spawnDrum(p.x, p.z, p.y);
    // Grow the respawn target so the drum-respawn system keeps the section stocked.
    this.targetDrums += drumPositions.length;
  }

  /** Count live drums (the destructible 'barrel'-category bodies). */
  private drumCount(): number {
    let n = 0;
    for (const b of this.bodies.values()) if (b.category === 'barrel') n++;
    return n;
  }

  /** Zombie mode: drop a wave of fresh drums onto open ground, up to the target.
   *  Wave size grows with the target so a larger arena refills at a believable pace. */
  private respawnDrumWave(): void {
    const maxWave = clamp(Math.round(this.targetDrums * 0.25), DRUM_RESPAWN_MIN_COUNT, DRUM_RESPAWN_MAX_COUNT);
    const want = DRUM_RESPAWN_MIN_COUNT + Math.floor(Math.random() * (maxWave - DRUM_RESPAWN_MIN_COUNT + 1));
    const room = this.targetDrums - this.drumCount();
    const n = Math.min(want, room);
    const radius = DESTRUCTIBLE_CONFIG.barrel.radius;
    for (let i = 0; i < n; i++) {
      const spot = this.findOpenSpot(radius);
      if (spot) this.spawnDrum(spot.x, spot.z);
    }
  }

  /** A random point — spread across the main room + unlocked sections — clear of
   *  cover, players and other props, or null if too crowded after several tries. */
  private findOpenSpot(radius: number): { x: number; z: number } | null {
    for (let i = 0; i < 40; i++) {
      const spot = randomSpawnPoint(
        this.roomLayout,
        this.ctx.state.unlockedSections,
        radius + 1,
        Math.random,
        CENTER_RESERVE,
      );
      if (!spot) continue;
      const x = spot.x;
      const z = spot.z;
      let clear = true;
      for (const o of this.ctx.obstacles) {
        const dx = x - o.x;
        const dz = z - o.z;
        const r = o.radius + radius + 0.5;
        if (dx * dx + dz * dz < r * r) { clear = false; break; }
      }
      if (!clear) continue;
      this.ctx.state.players.forEach((p) => {
        if (!p.alive) return;
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz < 4) clear = false; // ~2u clearance from players
      });
      for (const b of this.bodies.values()) {
        const dx = x - b.obj.x;
        const dz = z - b.obj.z;
        const r = b.radius + radius;
        if (dx * dx + dz * dz < r * r) { clear = false; break; }
      }
      if (clear) return { x, z };
    }
    return null;
  }

  /** Create a dynamic rigid body + its replicated entity. Tires and drums are
   *  both upright cylinders (Rapier cylinders are Y-aligned): a tire is a thin
   *  disc, a drum is tall. */
  private spawn(
    kind: DestructibleKind,
    category: DestructibleCategory,
    group: string,
    x: number,
    y: number,
    z: number,
  ): void {
    const cfg = DESTRUCTIBLE_CONFIG[category];
    const rb = this.physics.addCylinder({
      x,
      y,
      z,
      halfHeight: cfg.halfHeight,
      radius: cfg.radius,
      mass: cfg.mass,
      friction: cfg.friction,
      restitution: cfg.restitution,
      linearDamping: cfg.linearDamping,
      angularDamping: cfg.angularDamping,
    });

    const obj = new DestructibleObject();
    obj.id = `d${this.seq++}`;
    obj.kind = kind;
    obj.group = group;
    obj.x = x;
    obj.y = y;
    obj.z = z;
    obj.sx = cfg.radius;
    obj.sy = cfg.halfHeight;
    obj.sz = cfg.radius;
    // Drums and tires carry replicated HP.
    obj.hp = category === 'barrel' ? DRUM_HP : TIRE_HP;
    obj.maxHp = obj.hp;
    obj.active = false;
    this.ctx.state.destructibles.set(obj.id, obj);

    this.bodies.set(obj.id, {
      obj,
      rb,
      category,
      cfg,
      radius: cfg.radius,
      fromId: '',
      dmgReadyAt: new Map(),
      spent: false,
      hitReadyAt: 0,
      hp: category === 'barrel' ? DRUM_HP : TIRE_HP,
      wasAwake: true, // settle from spawn, then Rapier sleeps it
    });
  }

  /** Three separate tires stacked one on another — they physically settle into a
   *  pile (and stay stacked while asleep). Share a group so one spell scatters
   *  the whole stack. */
  private spawnTireStack(x: number, z: number): void {
    const group = `tire${this.structureSeq++}`;
    for (let i = 0; i < TIRE_STACK_COUNT; i++) {
      this.spawn('tire', 'tire', group, x, TIRE_TUBE + i * TIRE_STACK_SPACING, z);
    }
  }

  /** A single roll-away oil drum (rendered as `prop.arena.drum`). */
  private spawnDrum(x: number, z: number, y = DRUM_HALF_HEIGHT): void {
    this.spawn('barrel', 'barrel', '', x, y, z);
  }

  // --- Spell collision ------------------------------------------------------

  /**
   * Try to hit a destructible with a projectile at (px,pz) of radius `projR`
   * travelling along (dirX,dirZ). Returns true if a body was struck (so the
   * caller consumes the projectile). Spent tires are inert and pass-through.
   */
  tryProjectileHit(
    px: number,
    pz: number,
    projR: number,
    dirX: number,
    dirZ: number,
    fromId: string,
    amount = 0,
  ): boolean {
    for (const body of this.bodies.values()) {
      const dx = body.obj.x - px;
      const dz = body.obj.z - pz;
      const r = body.radius + projR;
      if (dx * dx + dz * dz <= r * r) {
        this.impact(body, px, pz, dirX, dirZ, fromId, amount);
        return true; // first hit consumes the projectile
      }
    }
    return false;
  }

  /**
   * Check for the closest destructible that passes the provided checker function.
   * If found, returns the distance and a callback to apply the physical shove/damage.
   */
  tryKick(
    check: (x: number, z: number, radius: number) => number | null,
    px: number,
    pz: number,
    dirX: number,
    dirZ: number,
    fromId: string,
  ): { distance: number; perform: () => void } | null {
    let bestBody: Body | null = null;
    let bestDist = Infinity;

    for (const body of this.bodies.values()) {
      const dist = check(body.obj.x, body.obj.z, body.radius);
      if (dist !== null && dist < bestDist) {
        bestDist = dist;
        bestBody = body;
      }
    }

    if (!bestBody) return null;
    return {
      distance: bestDist,
      perform: () => {
        this.impact(bestBody!, px, pz, dirX, dirZ, fromId, 1);
      },
    };
  }


  /** Push/scatter every destructible within `radius` of (x,z) — used by AoE
   *  abilities and dash slams. `amount` (the AoE's damage) also chips drum HP. */
  pushInRadius(x: number, z: number, radius: number, fromId: string, amount = 0): void {
    for (const body of [...this.bodies.values()]) {
      const dx = body.obj.x - x;
      const dz = body.obj.z - z;
      const r = radius + body.radius;
      if (dx * dx + dz * dz <= r * r) this.impact(body, x, z, 0, 0, fromId, amount);
    }
  }

  /** Shove + damage every destructible inside a beam capsule — a ray from
   *  (ox,oz) along (dx,dz) of `length`, `halfWidth` wide. Each body is hit at most
   *  once per call (unlike repeatedly sampling {@link pushInRadius}). */
  damageInBeam(
    ox: number,
    oz: number,
    dx: number,
    dz: number,
    length: number,
    halfWidth: number,
    fromId: string,
    amount: number,
  ): void {
    for (const body of [...this.bodies.values()]) {
      const rx = body.obj.x - ox;
      const rz = body.obj.z - oz;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > length) continue;
      const perp = Math.abs(rx * dz - rz * dx); // (dx,dz) is unit → perpendicular distance
      if (perp <= halfWidth + body.radius) this.impact(body, ox, oz, dx, dz, fromId, amount);
    }
  }

  /** Resolve one impact: tires scatter their whole stack once; drums take a
   *  single clamped shove (repeatable after a cooldown) AND lose `amount` HP,
   *  being destroyed when it runs out. */
  private impact(
    body: Body,
    srcX: number,
    srcZ: number,
    spellDirX: number,
    spellDirZ: number,
    fromId: string,
    amount: number,
  ): void {
    if (body.category === 'tire') {
      const wasSpent = body.spent;
      if (!wasSpent) {
        this.scatterStack(body, srcX, srcZ, spellDirX, spellDirZ, fromId);
      }
      if (amount > 0) {
        body.hp -= amount;
        body.obj.hp = Math.max(0, body.hp);
        if (body.hp <= 0) {
          this.destroyTire(body);
          return;
        }
      }
      if (wasSpent && this.ctx.now() >= body.hitReadyAt) {
        const dir = outwardDir(body.obj.x, body.obj.z, srcX, srcZ, spellDirX, spellDirZ);
        this.applyImpulse(body, dir.x, dir.z, 1, fromId);
        body.hitReadyAt = this.ctx.now() + body.cfg.cooldownMs;
      }
      return;
    }
    // Drum: chip its HP (replicated for the integrity bar) and destroy it once
    // depleted (no shove if it's gone).
    if (amount > 0) {
      body.hp -= amount;
      body.obj.hp = Math.max(0, body.hp);
      if (body.hp <= 0) {
        this.destroyDrum(body);
        return;
      }
    }
    if (this.ctx.now() < body.hitReadyAt) return;
    const dir = outwardDir(body.obj.x, body.obj.z, srcX, srcZ, spellDirX, spellDirZ);
    this.applyImpulse(body, dir.x, dir.z, 1, fromId);
    body.hitReadyAt = this.ctx.now() + body.cfg.cooldownMs;
  }

  /** Destroy a tire whose HP ran out: pull its physics body + replicated entity. */
  private destroyTire(body: Body): void {
    this.physics.removeBody(body.rb);
    this.ctx.state.destructibles.delete(body.obj.id);
    this.bodies.delete(body.obj.id);
  }

  /** Destroy a drum whose HP ran out: pull its physics body + replicated entity.
   *  No VFX — the drum just disappears (clients drop it when it leaves state). */
  private destroyDrum(body: Body): void {
    const { x, z } = body.obj;
    this.physics.removeBody(body.rb);
    this.ctx.state.destructibles.delete(body.obj.id);
    this.bodies.delete(body.obj.id);
    // A destroyed drum may drop a pickable (the room decides the odds + kind).
    this.drumDestroyedCb?.(x, z);
  }

  /** Scatter the whole stack the struck tire belongs to (one-shot): members fan
   *  out around the incoming direction, the upper tires getting a bit more pop.
   *  Marked spent so they can then be hit individually. */
  private scatterStack(
    hit: Body,
    srcX: number,
    srcZ: number,
    spellDirX: number,
    spellDirZ: number,
    fromId: string,
  ): void {
    if (hit.spent) return;
    const members = [...this.bodies.values()]
      .filter((b) => b.obj.group === hit.obj.group)
      .sort((a, b) => a.obj.y - b.obj.y);

    let bx = members.reduce((s, b) => s + b.obj.x, 0) / members.length - srcX;
    let bz = members.reduce((s, b) => s + b.obj.z, 0) / members.length - srcZ;
    if (Math.hypot(bx, bz) < 1e-3) {
      bx = spellDirX || 1;
      bz = spellDirZ || 0;
    }
    const base = Math.atan2(bz, bx);
    members.forEach((b, i) => {
      b.spent = true;
      const spread = (i - (members.length - 1) / 2) * 0.6; // fan in radians
      const a = base + spread;
      this.applyImpulse(b, Math.cos(a), Math.sin(a), 1 + i * 0.25, fromId);
      b.hitReadyAt = this.ctx.now() + b.cfg.cooldownMs;
    });
  }

  /** Wake a body and apply a clamped impulse slightly ABOVE its center — the
   *  offset induces a tipping torque so it rolls/tumbles instead of just sliding. */
  private applyImpulse(body: Body, dirX: number, dirZ: number, popMul: number, fromId: string): void {
    const cfg = body.cfg;
    const mag = Math.min(cfg.hitImpulse, cfg.maxImpulse);
    const t = body.rb.translation();
    body.rb.applyImpulseAtPoint(
      { x: dirX * mag, y: cfg.popImpulse * popMul, z: dirZ * mag },
      { x: t.x, y: t.y + cfg.halfHeight * 0.8, z: t.z },
      true, // wake the body
    );
    body.fromId = fromId;
  }

  // --- Simulation -----------------------------------------------------------

  /** Replicate awake bodies' transforms (the room steps the shared world before
   *  this). Sleeping bodies write nothing — zero bandwidth while settled. */
  update(): void {
    // Zombie mode: top the drums back up in periodic waves (like the barrels).
    if (this.ctx.state.zombieMode && this.ctx.now() >= this.nextDrumRespawnAt) {
      if (this.drumCount() < this.targetDrums) this.respawnDrumWave();
      this.nextDrumRespawnAt = this.ctx.now() + this.randomDrumRespawnDelay();
    }
    for (const body of this.bodies.values()) {
      if (body.rb.isSleeping()) {
        if (body.wasAwake) {
          this.writeTransform(body);
          body.obj.active = false;
          body.wasAwake = false;
        }
        continue;
      }
      this.writeTransform(body);
      body.obj.active = true;
      body.wasAwake = true;
      this.damagePlayers(body);
    }
  }

  /** Copy the rigid body's transform into the replicated entity. In zombie mode,
   *  also enforce the cross-shaped playable area so bodies can't tumble into the
   *  void corners between sections. */
  private writeTransform(body: Body): void {
    const t = body.rb.translation();
    const r = body.rb.rotation();
    let px = t.x;
    let pz = t.z;

    // Cross-shape clamp: if the body drifted outside the playable area, teleport
    // the physics body back and zero its velocity so it doesn't keep grinding.
    if (this.roomLayout && this.ctx.state.zombieMode) {
      const clamped = clampToUnlockedArea(
        px, pz, this.roomLayout,
        this.ctx.state.unlockedSections, body.radius,
      );
      if (clamped.x !== px || clamped.z !== pz) {
        px = clamped.x;
        pz = clamped.z;
        body.rb.setTranslation({ x: px, y: t.y, z: pz }, true);
        body.rb.setLinvel({ x: 0, y: body.rb.linvel().y, z: 0 }, true);
      }
    }

    body.obj.x = px;
    body.obj.y = t.y;
    body.obj.z = pz;
    body.obj.qx = r.x;
    body.obj.qy = r.y;
    body.obj.qz = r.z;
    body.obj.qw = r.w;
  }

  /** Deal small impact damage to any player a fast-moving body strikes, and
   *  shove the body off the player so it doesn't sit inside them. */
  private damagePlayers(body: Body): void {
    const v = body.rb.linvel();
    if (Math.hypot(v.x, v.y, v.z) < MIN_DAMAGE_VELOCITY) return;
    const now = this.ctx.now();
    const hitR = body.radius + PLAYER_RADIUS;
    this.ctx.state.players.forEach((player, id) => {
      if (!player.alive) return;
      const dx = player.x - body.obj.x;
      const dz = player.z - body.obj.z;
      if (dx * dx + dz * dz > hitR * hitR) return;
      if (Math.abs(body.obj.y - (player.y + 1)) > 1.6) return;
      if ((body.dmgReadyAt.get(id) ?? 0) > now) return;
      this.combat.dealDamage(player, IMPACT_DAMAGE_TO_PLAYER, body.fromId);
      body.dmgReadyAt.set(id, now + DAMAGE_COOLDOWN_MS);
      const d = Math.hypot(dx, dz) || 1;
      body.rb.applyImpulse({ x: (-dx / d) * body.cfg.mass * 2, y: 0, z: (-dz / d) * body.cfg.mass * 2 }, true);
    });
  }

  /** Pull every destructible toward the vortex center. */
  pull(vortexX: number, vortexZ: number, pullRadius: number): void {
    for (const body of this.bodies.values()) {
      const t = body.rb.translation();
      const dx = vortexX - t.x;
      const dz = vortexZ - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01 && dist <= pullRadius + body.radius) {
        const pullSpeed = (3.0 + (1.0 - Math.min(1, dist / pullRadius)) * 3.0) * 2;
        // Apply an inward impulse towards the center every tick
        const force = pullSpeed * body.cfg.mass * 0.15; // tuning factor
        body.rb.applyImpulse({
          x: (dx / dist) * force,
          y: 0,
          z: (dz / dist) * force,
        }, true);
      }
    }
  }
}

/** Outward unit direction from (srcX,srcZ) to (x,z), blended with a spell's
 *  travel direction; falls back to the spell dir (or +X) on a degenerate case. */
function outwardDir(
  x: number,
  z: number,
  srcX: number,
  srcZ: number,
  spellDirX: number,
  spellDirZ: number,
): { x: number; z: number } {
  let dx = x - srcX;
  let dz = z - srcZ;
  const len = Math.hypot(dx, dz);
  if (len > 1e-3) {
    dx /= len;
    dz /= len;
    dx += spellDirX * 0.5;
    dz += spellDirZ * 0.5;
  } else if (Math.hypot(spellDirX, spellDirZ) > 1e-3) {
    dx = spellDirX;
    dz = spellDirZ;
  } else {
    dx = 1;
    dz = 0;
  }
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}
