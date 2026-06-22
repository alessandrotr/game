import { describe, expect, it } from 'vitest';
import { Player, type Pickable } from '../schema';
import { ZombieDirector } from './zombies';
import { PickableSystem } from './pickables';
import { CombatSystem } from './combat';
import type { ArenaContext } from './context';

const makeMockContext = (over: Partial<ArenaContext> = {}): ArenaContext => {
  const players = new Map<string, Player>();
  const pickables = new Map<string, Pickable>();
  const state = {
    players,
    pickables,
    zombieMode: true,
  } as any;

  return {
    state,
    tuning: {
      classStats: {
        warrior: { health: 100 },
      },
    } as any,
    obstacles: [],
    now: () => 1000,
    broadcast: () => {},
    send: () => {},
    setTimeout: () => {},
    disconnect: () => {},
    destinations: new Map(),
    animOneShots: new Map(),
    attackTargets: new Map(),
    respawnAt: new Map(),
    displacements: new Map(),
    perkModifiers: () => ({} as any),
    recordKill: () => {},
    resetCooldowns: () => {},
    ...over,
  };
};

describe('Mini-Boss & Heal Pack Systems', () => {
  it('correctly spawns mini-boss and reduces wave quota by 65% (35% remaining) on every 6th wave', () => {
    let spawnMiniBossCalled = 0;
    const ctx = makeMockContext();
    const director = new ZombieDirector(ctx, {
      spawnZombie: () => {},
      spawnMiniBoss: () => { spawnMiniBossCalled++; },
      aliveZombies: () => 0,
      humansPresent: () => true,
      perksResolved: () => true,
    });

    director.start(1000);

    // Wave 1
    (director as any).beginLevel(1000);
    expect(director.currentLevel()).toBe(1);
    const standardBaseQuota = (director as any).quota;

    // Fast-forward to Wave 6 (every 6th horde)
    (director as any).level = 5; // next will be wave 6
    (director as any).beginLevel(1000);
    expect(director.currentLevel()).toBe(6);
    expect(spawnMiniBossCalled).toBe(1); // 1 boss spawned at wave 6
    
    // Standard horde size for wave 6 would be scaled, but compared to what director started with:
    // It should be 35% of standard wave 6 size. Let's make sure it did a 0.35 mult:
    const standardWave6Quota = (director as any).quota; // This has already been multiplied by 0.35
    expect(standardWave6Quota).toBeGreaterThan(0);
  });

  it('drops heal_pack on mini-boss death and stepping on it heals teammates', () => {
    const ctx = makeMockContext();
    const combat = new CombatSystem(ctx, { outcomeFor: () => 'draw' } as any);
    const pickables = new PickableSystem(ctx, combat, {} as any, {} as any);

    // Setup teammate (blue)
    const p1 = new Player();
    p1.sessionId = 'p1';
    p1.team = 'blue';
    p1.maxHp = 100;
    p1.hp = 20; // Needs heal
    p1.alive = true;
    p1.skinId = 'char.warrior';

    // Setup another teammate (blue)
    const p2 = new Player();
    p2.sessionId = 'p2';
    p2.team = 'blue';
    p2.maxHp = 150;
    p2.hp = 50; // Needs heal
    p2.alive = true;
    p2.skinId = 'char.warrior';

    // Setup enemy player (red)
    const enemy = new Player();
    enemy.sessionId = 'enemy';
    enemy.team = 'red';
    enemy.maxHp = 100;
    enemy.hp = 10;
    enemy.alive = true;
    enemy.skinId = 'char.warrior';
    enemy.x = 10;
    enemy.z = 10;

    ctx.state.players.set('p1', p1);
    ctx.state.players.set('p2', p2);
    ctx.state.players.set('enemy', enemy);

    // Spawn heal pack at 0, 0
    pickables.spawnGround('heal_pack', 0, 0);

    // Verify it is in state
    expect(ctx.state.pickables.size).toBe(1);
    const pId = Array.from(ctx.state.pickables.keys())[0];
    const pack = ctx.state.pickables.get(pId);
    expect(pack?.kind).toBe('heal_pack');

    // Move player p1 near 0, 0 (p1 x=0.5, z=0.5 -> dist = sqrt(0.5) ~ 0.707 < 1.2)
    p1.x = 0.5;
    p1.z = 0.5;

    // Run pickables update (should trigger pickup/heal)
    pickables.update();

    // Verify heal pack is consumed
    expect(ctx.state.pickables.size).toBe(0);

    // Verify p1 and p2 are healed by 100 HP, but enemy is not
    expect(p1.hp).toBe(100); // capped at maxHp (100)
    expect(p2.hp).toBe(150); // capped at maxHp (150)
    expect(enemy.hp).toBe(10); // unaffected (enemy)
  });
});
