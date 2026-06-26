import { describe, expect, it } from 'vitest';
import {
  ZOMBIE_SPEED_JITTER,
  ZOMBIE_WANDER_REROLL_MAX_MS,
  ZOMBIE_WANDER_REROLL_MIN_MS,
} from '@arena/shared';
import { ZombieSurvival, type ZombieSurvivalDeps } from './zombieSurvival';

// A no-op stand-in for the gameplay systems the mini-boss / door logic drive.
// The tests below exercise only the AI-personality + portal + counts helpers,
// which never touch these — so an empty cast is enough to satisfy the deps type.
const stubSystem = <T>() => ({}) as T;

const make = (over: Partial<ZombieSurvivalDeps> = {}) =>
  new ZombieSurvival({
    now: () => 1000,
    state: { players: new Map(), unlockedSections: 0 } as ZombieSurvivalDeps['state'],
    bots: new Map(),
    verticalVelocity: new Map(),
    grounded: new Map(),
    cooldowns: new Map(),
    attackTargets: new Map(),
    arenaLimit: 38,
    arenaLimitZ: 38,
    zombieStaticObstacles: [],
    nextBotId: () => 1,
    resetPlayer: () => {},
    roomLayout: () => null,
    combat: stubSystem<ZombieSurvivalDeps['combat']>(),
    projectiles: stubSystem<ZombieSurvivalDeps['projectiles']>(),
    cover: stubSystem<ZombieSurvivalDeps['cover']>(),
    barrels: stubSystem<ZombieSurvivalDeps['barrels']>(),
    destructibles: stubSystem<ZombieSurvivalDeps['destructibles']>(),
    traps: stubSystem<ZombieSurvivalDeps['traps']>(),
    broadcast: () => {},
    ...over,
  });

describe('ZombieSurvival.aiFor', () => {
  it('returns a stable personality object per id', () => {
    const z = make();
    const a = z.aiFor('zombie-1');
    expect(z.aiFor('zombie-1')).toBe(a); // same object on repeat calls
    expect(z.aiFor('zombie-2')).not.toBe(a); // different id → different object
  });

  it('rolls speedOffset within ±the jitter range', () => {
    const z = make();
    for (let i = 0; i < 100; i++) {
      const ai = z.aiFor(`z${i}`);
      expect(Math.abs(ai.speedOffset)).toBeLessThanOrEqual(ZOMBIE_SPEED_JITTER);
      expect(Math.abs(ai.wander)).toBeGreaterThanOrEqual(0.55);
      expect(Math.abs(ai.wander)).toBeLessThanOrEqual(1.0);
    }
  });

  it('forget() drops the personality so a recycled id re-rolls fresh', () => {
    const z = make();
    const a = z.aiFor('z');
    z.forget('z');
    expect(z.aiFor('z')).not.toBe(a);
  });
});

describe('ZombieSurvival.rollWanderInterval', () => {
  it('stays within the configured re-roll window', () => {
    const z = make();
    for (let i = 0; i < 100; i++) {
      const v = z.rollWanderInterval();
      expect(v).toBeGreaterThanOrEqual(ZOMBIE_WANDER_REROLL_MIN_MS);
      expect(v).toBeLessThanOrEqual(ZOMBIE_WANDER_REROLL_MAX_MS);
    }
  });
});

describe('ZombieSurvival.pickPortal', () => {
  it('returns a valid fixed gate before the room expands (no layout / 0 sections)', () => {
    const z = make({ roomLayout: () => null });
    const p = z.pickPortal();
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.z)).toBe(true);
  });
});
