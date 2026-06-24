import { describe, expect, it, vi } from 'vitest';
import { Player, StatusEffect, ArenaState } from '../schema.js';
import { CombatSystem } from './combat.js';
import type { ArenaContext } from './context.js';
import { ABILITIES, PLAYER_RADIUS, IDENTITY_MODIFIERS, type AbilityKind } from '@arena/shared';

const makeMockContext = (over: Partial<ArenaContext> = {}): ArenaContext => {
  const players = new Map<string, Player>();
  const state = {
    players,
    zombieMode: false,
  } as any;

  let time = 1000;

  return {
    state,
    tuning: {
      classStats: {
        ninja: { health: 300, mana: 120 },
      },
      abilityFor: (cls: string, ab: string) => ABILITIES[ab as AbilityKind],
    } as any,
    obstacles: [],
    now: () => time,
    broadcast: () => {},
    send: () => {},
    setTimeout: (cb: () => void) => cb(), // default synchronous trigger
    disconnect: () => {},
    destinations: new Map(),
    animOneShots: new Map(),
    attackTargets: new Map(),
    respawnAt: new Map(),
    displacements: new Map(),
    perkModifiers: () => IDENTITY_MODIFIERS,
    recordKill: () => {},
    resetCooldowns: () => {},
    ...over,
  };
};

const setupCombatSystem = (ctx: ArenaContext): CombatSystem => {
  const combat = new CombatSystem(ctx, { outcomeFor: () => 'draw' } as any);
  
  // Attach mock systems to prevent undefined errors in runCast / effectRuntime
  combat.attachBarrels({
    triggerInRadius: vi.fn(),
    trigger: vi.fn(),
    pull: vi.fn(),
  } as any);
  combat.attachDestructibles({
    pushInRadius: vi.fn(),
    pull: vi.fn(),
    tryProjectileHit: vi.fn(() => false),
  } as any);
  combat.attachCover({
    damage: vi.fn(),
    damageInRadius: vi.fn(),
    pullCars: vi.fn(),
    hitProjectile: vi.fn(() => false),
  } as any);
  combat.attachProjectiles({
    spawnProjectile: vi.fn(),
  } as any);

  return combat;
};

describe('Ninja Class Abilities Integration', () => {
  it('Q (Katana Slash) deals 25 damage immediately and 10 damage 300ms later', () => {
    let capturedTimeoutCb: (() => void) | undefined;
    const ctx = makeMockContext({
      setTimeout: (cb: () => void, delayMs: number) => {
        if (delayMs === 300) {
          capturedTimeoutCb = cb;
        } else {
          cb();
        }
      },
    });

    const combat = setupCombatSystem(ctx);

    // Caster ninja at 0, 0, facing +Z (rotation 0)
    const caster = new Player();
    caster.sessionId = 'caster';
    caster.characterClass = 'ninja';
    caster.alive = true;
    caster.x = 0;
    caster.z = 0;
    caster.rotation = 0;
    ctx.state.players.set('caster', caster);

    // Victim in range and arc (0, 2)
    const victim = new Player();
    victim.sessionId = 'victim';
    victim.characterClass = 'warrior';
    victim.alive = true;
    victim.x = 0;
    victim.z = 2;
    victim.maxHp = 100;
    victim.hp = 100;
    ctx.state.players.set('victim', victim);

    // Victim 2 at a 50-degree angle (1.532, 1.286), which is inside the 120° first arc
    // and also inside the 120° second arc.
    const victim2 = new Player();
    victim2.sessionId = 'victim2';
    victim2.characterClass = 'warrior';
    victim2.alive = true;
    victim2.x = 1.532;
    victim2.z = 1.286;
    victim2.maxHp = 100;
    victim2.hp = 100;
    ctx.state.players.set('victim2', victim2);

    // Victim 3 at a 70-degree angle (1.879, 0.684), which is outside the 120° arcs.
    const victim3 = new Player();
    victim3.sessionId = 'victim3';
    victim3.characterClass = 'warrior';
    victim3.alive = true;
    victim3.x = 1.879;
    victim3.z = 0.684;
    victim3.maxHp = 100;
    victim3.hp = 100;
    ctx.state.players.set('victim3', victim3);

    // 1. Initial cast
    combat.resolveCast(caster, ABILITIES.ninja_q, 0, 1);

    // Check first hit deals 25 damage to both victim and victim2 (both inside 120° arc)
    // but not victim3 (outside 120° arc)
    expect(victim.hp).toBe(75);
    expect(victim2.hp).toBe(75);
    expect(victim3.hp).toBe(100);
    expect(capturedTimeoutCb).toBeDefined();

    // 2. 300ms later secondary swing
    capturedTimeoutCb!();

    // Check secondary swing deals 10 damage to victim, victim2 (both inside 120° arc)
    // and victim3 (inside the updated 180° frontal arc and range 4.5)
    expect(victim.hp).toBe(65);
    expect(victim2.hp).toBe(65);
    expect(victim3.hp).toBe(90);
  });

  it('R (Smoke Teleport) clamps/resolves target coordinate against obstacles and blinds enemies', () => {
    // Setup obstacle at (5, 5) with radius 2
    const obstacle = { x: 5, z: 5, radius: 2, height: 0 };
    const ctx = makeMockContext({
      obstacles: [obstacle],
    });

    const combat = setupCombatSystem(ctx);

    // Caster ninja at 0, 0
    const caster = new Player();
    caster.sessionId = 'caster';
    caster.characterClass = 'ninja';
    caster.alive = true;
    caster.x = 0;
    caster.z = 0;
    ctx.state.players.set('caster', caster);

    // Victim at (5.5, 5.5) inside obstacle range
    const victim = new Player();
    victim.sessionId = 'victim';
    victim.characterClass = 'warrior';
    victim.alive = true;
    victim.x = 5.2;
    victim.z = 5.2;
    victim.maxHp = 100;
    victim.hp = 100;
    ctx.state.players.set('victim', victim);

    // Resolve R targeting slightly off-center of obstacle (5, 5.01) to trigger collision push out
    // R range is 10, target is at 5, 5.01 (distance ~7.08) so range check passes.
    combat.resolveCast(caster, ABILITIES.ninja_r, 0.707, 0.707, 5, 5.01);

    // Verify coordinates are clamped/pushed out of the obstacle (distance from (5,5) should be obstacle.radius + PLAYER_RADIUS)
    const distFromObstacle = Math.hypot(caster.x - 5, caster.z - 5);
    expect(distFromObstacle).toBeCloseTo(obstacle.radius + PLAYER_RADIUS, 2);

    // Verify victim (near caster's teleport landing position) took damage and is blinded
    expect(victim.hp).toBe(65);
    const blindStatus = victim.statuses.find(s => s.kind === 'blind');
    expect(blindStatus).toBeDefined();
    expect(blindStatus?.expiresAt).toBe(ctx.now() + 1500);
  });

  it('casting R during Q sequence cancels the Q\'s second slash', () => {
    let capturedTimeoutCb: (() => void) | undefined;
    const ctx = makeMockContext({
      setTimeout: (cb: () => void, delayMs: number) => {
        if (delayMs === 300) {
          capturedTimeoutCb = cb;
        } else {
          cb();
        }
      },
    });

    const combat = setupCombatSystem(ctx);

    // Caster ninja at 0, 0
    const caster = new Player();
    caster.sessionId = 'caster';
    caster.characterClass = 'ninja';
    caster.alive = true;
    caster.x = 0;
    caster.z = 0;
    ctx.state.players.set('caster', caster);

    // Victim in range and arc (0, 2)
    const victim = new Player();
    victim.sessionId = 'victim';
    victim.characterClass = 'warrior';
    victim.alive = true;
    victim.x = 0;
    victim.z = 2;
    victim.maxHp = 100;
    victim.hp = 100;
    ctx.state.players.set('victim', victim);

    // 1. Cast Q
    combat.resolveCast(caster, ABILITIES.ninja_q, 0, 1);

    // Verify first hit deals 25 damage
    expect(victim.hp).toBe(75);
    expect(capturedTimeoutCb).toBeDefined();

    // 2. Cast R mid-sequence
    combat.resolveCast(caster, ABILITIES.ninja_r, 0, 1, 5, 5);
    
    // Verify R sets lastNinjaQTime to 0
    expect((caster as any).lastNinjaQTime).toBe(0);

    // 3. Trigger second Q slash timeout
    capturedTimeoutCb!();

    // Victim HP should still be 75 (second slash did not fire)
    expect(victim.hp).toBe(75);
  });

  it('E (Shadow Dash) applies a displacement with distance 6 and speed 32', () => {
    const ctx = makeMockContext();
    const combat = setupCombatSystem(ctx);

    const caster = new Player();
    caster.sessionId = 'caster';
    caster.characterClass = 'ninja';
    caster.alive = true;
    caster.x = 0;
    caster.z = 0;
    ctx.state.players.set('caster', caster);

    combat.resolveCast(caster, ABILITIES.ninja_e, 0, 1);

    const disp = ctx.displacements.get('caster');
    expect(disp).toBeDefined();
    
    // Velocity magnitude should be 32 (speed)
    const speed = Math.hypot(disp!.vx, disp!.vz);
    expect(speed).toBeCloseTo(32, 2);

    // Travel duration in ms should be (distance / speed) * 1000 = (6 / 32) * 1000 = 187.5ms
    const durationMs = disp!.until - ctx.now();
    expect(durationMs).toBeCloseTo(187.5, 1);
  });

  it('shield absorbs damage and decays on hits', () => {
    const ctx = makeMockContext();
    const combat = setupCombatSystem(ctx);

    const caster = new Player();
    caster.sessionId = 'caster';
    caster.characterClass = 'warrior';
    caster.alive = true;
    caster.maxHp = 100;
    caster.hp = 100;
    caster.x = 0;
    caster.z = 0;
    ctx.state.players.set('caster', caster);

    // Initial state: shield is 0
    expect(caster.shield).toBe(0);

    // Apply shield of 60
    combat.addShield(caster, 60, 5000, 'caster');
    expect(caster.shield).toBe(60);
    expect(caster.statuses.some(s => s.kind === 'shield')).toBe(true);

    // Take 25 damage: shield should be 35, HP should remain 100
    combat.dealDamage(caster, 25, 'other');
    expect(caster.shield).toBe(35);
    expect(caster.hp).toBe(100);
    expect(caster.statuses.find(s => s.kind === 'shield')?.magnitude).toBe(35);
  });

  it('E (Shadow Dash) recast (second dash) applies a displacement with distance 6 and grants a 25 HP shield for 3.5s', () => {
    const ctx = makeMockContext();
    const combat = setupCombatSystem(ctx);

    const caster = new Player();
    caster.sessionId = 'caster';
    caster.characterClass = 'ninja';
    caster.alive = true;
    caster.x = 0;
    caster.z = 0;
    caster.maxHp = 100;
    caster.hp = 100;
    ctx.state.players.set('caster', caster);

    // Simulate the recast configuration constructed by the server
    const recastConfig = {
      ...ABILITIES.ninja_e,
      effects: [
        { type: 'dash', distance: 6, speed: 32 },
        { type: 'shield', amount: 25, durationMs: 3500 },
      ] as any[],
    };

    combat.resolveCast(caster, recastConfig, 0, 1);

    // Verify second dash displacement
    const disp = ctx.displacements.get('caster');
    expect(disp).toBeDefined();
    const speed = Math.hypot(disp!.vx, disp!.vz);
    expect(speed).toBeCloseTo(32, 2);
    const durationMs = disp!.until - ctx.now();
    expect(durationMs).toBeCloseTo(187.5, 1); // 6 / 32 * 1000 = 187.5ms

    // Verify 25 HP shield is applied
    expect(caster.shield).toBe(25);
    const shieldStatus = caster.statuses.find(s => s.kind === 'shield');
    expect(shieldStatus).toBeDefined();
    expect(shieldStatus?.magnitude).toBe(25);
    expect(shieldStatus?.expiresAt).toBe(ctx.now() + 3500);
  });
});
