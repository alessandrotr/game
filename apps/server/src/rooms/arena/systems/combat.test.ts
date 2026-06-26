import { describe, expect, it } from 'vitest';
import { IDENTITY_MODIFIERS, ZOMBIE_SKIN_ID } from '@arena/shared';
import { Player } from '../../schema';
import { CombatSystem } from './combat';
import type { ArenaContext } from '../context';

interface Broadcast {
  type: string | number;
  message: any;
}

const makeCtx = (
  nowFn: () => number,
): ArenaContext => {
  const players = new Map<string, Player>();
  return {
    state: { players, zombieMode: false } as any,
    tuning: { classStats: { warrior: { health: 100 } } } as any,
    obstacles: [],
    now: nowFn,
    broadcast: () => {},
    send: () => {},
    setTimeout: () => {},
    disconnect: () => {},
    destinations: new Map(),
    animOneShots: new Map(),
    attackTargets: new Map(),
    respawnAt: new Map(),
    displacements: new Map(),
    perkModifiers: () => IDENTITY_MODIFIERS,
    recordKill: () => {},
    resetCooldowns: () => {},
  } as ArenaContext;
};

const human = (id: string, over: Partial<Player> = {}): Player => {
  const p = new Player();
  p.sessionId = id;
  p.skinId = 'char.warrior';
  p.maxHp = 100;
  p.hp = 100;
  p.mana = 0;
  p.maxMana = 100;
  p.alive = true;
  Object.assign(p, over);
  return p;
};

const zombie = (id: string, over: Partial<Player> = {}): Player => {
  const p = new Player();
  p.sessionId = id;
  p.skinId = ZOMBIE_SKIN_ID;
  p.maxHp = 100;
  p.hp = 100;
  p.alive = true;
  Object.assign(p, over);
  return p;
};

describe('CombatSystem CC Chain Protection', () => {
  it('applies standard DR and immunity to players/bots', () => {
    let currentTime = 1000;
    const ctx = makeCtx(() => currentTime);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const player = human('p1');
    ctx.state.players.set('p1', player);

    // 1st CC: Should have 100% duration (expires at 3000)
    combat.applyStatus(player, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(player.statuses.length).toBe(1);
    expect(player.statuses[0].expiresAt).toBe(currentTime + 2000);

    // 2nd CC: within 8s (at t = 4000) should have 50% duration (expires at 5000)
    currentTime = 4000;
    combat.updateStatuses(player); // Prune first stun (expired at 3000)
    expect(player.statuses.length).toBe(0);

    combat.applyStatus(player, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(player.statuses.length).toBe(1);
    expect(player.statuses[0].expiresAt).toBe(currentTime + 1000); // 2000 * 0.5 = 1000

    // 3rd CC: within 8s (at t = 7000) should be immune
    currentTime = 7000;
    combat.updateStatuses(player); // Prune second stun (expired at 5000)
    expect(player.statuses.length).toBe(0);

    combat.applyStatus(player, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(player.statuses.length).toBe(0); // Immune, no stun applied

    // 4th CC: at t = 10000 (still within 8s of the last actual CC at t = 4000)
    // Time elapsed since t=4000 is 6s (<8s). So player is still immune.
    currentTime = 10000;
    combat.updateStatuses(player);
    combat.applyStatus(player, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(player.statuses.length).toBe(0);

    // 5th CC: at t = 13000 (9s since the last actual CC at t = 4000).
    // The window has expired, so it resets back to 1st CC (100% duration).
    currentTime = 13000;
    combat.updateStatuses(player);
    combat.applyStatus(player, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(player.statuses.length).toBe(1);
    expect(player.statuses[0].expiresAt).toBe(currentTime + 2000);
  });

  it('does not apply CC chain protection to zombies', () => {
    let currentTime = 1000;
    const ctx = makeCtx(() => currentTime);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const enemy = zombie('z1');
    ctx.state.players.set('z1', enemy);

    // 1st CC
    combat.applyStatus(enemy, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(enemy.statuses.length).toBe(1);
    expect(enemy.statuses[0].expiresAt).toBe(currentTime + 2000);

    // 2nd CC within 8s
    currentTime = 4000;
    combat.updateStatuses(enemy);
    combat.applyStatus(enemy, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(enemy.statuses.length).toBe(1);
    expect(enemy.statuses[0].expiresAt).toBe(currentTime + 2000); // Still 100%

    // 3rd CC within 8s
    currentTime = 7000;
    combat.updateStatuses(enemy);
    combat.applyStatus(enemy, { kind: 'stun', durationMs: 2000 }, 'attacker');
    expect(enemy.statuses.length).toBe(1);
    expect(enemy.statuses[0].expiresAt).toBe(currentTime + 2000); // Still 100%
  });

  it('applies a 20% slow to enemies hit by the priest Sanctuary (heal) field', () => {
    let currentTime = 1000;
    const ctx = makeCtx(() => currentTime);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);

    const priest = human('priest1');
    const enemy = human('enemy1', { x: 2, z: 2 }); // within Sanctuary radius (8)
    ctx.state.players.set('priest1', priest);
    ctx.state.players.set('enemy1', enemy);

    // Apply the field status to the priest
    combat.applyStatus(priest, { kind: 'field', durationMs: 3000, tickMs: 500, tickAmount: 6, magnitude: 8, ability: 'heal' }, 'priest1');
    
    // Ticking the status should deal damage and apply a 20% slow (magnitude 0.8) to the enemy
    currentTime = 1500;
    combat.updateStatuses(priest);

    // Verify enemy is slowed
    const slowStatus = enemy.statuses.find(s => s.kind === 'slow');
    expect(slowStatus).toBeDefined();
    expect(slowStatus?.magnitude).toBeCloseTo(0.80);
    expect(slowStatus?.expiresAt).toBe(currentTime + 1000);
  });
});
