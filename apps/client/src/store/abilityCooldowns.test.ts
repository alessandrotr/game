import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './useGameStore';
import {
  triggerCooldown,
  cooldownRemaining,
  isOnCooldown,
  resetCooldowns,
  getLocalCooldownMult,
  getLocalManaCostMult,
} from './abilityCooldowns';
import type { PlayerView } from '@arena/shared';

describe('abilityCooldowns store', () => {
  beforeEach(() => {
    resetCooldowns();
    useGameStore.setState({ sessionId: null });
    useGameStore.getState().players.clear();
  });

  it('triggers and tracks cooldowns', () => {
    expect(isOnCooldown('fireball')).toBe(false);
    expect(cooldownRemaining('fireball')).toBe(0);

    triggerCooldown('fireball', 1000);
    expect(isOnCooldown('fireball')).toBe(true);
    expect(cooldownRemaining('fireball')).toBeGreaterThan(0);
    expect(cooldownRemaining('fireball')).toBeLessThanOrEqual(1000);
  });

  it('resets a single cooldown or all cooldowns', () => {
    triggerCooldown('fireball', 1000);
    triggerCooldown('heal', 2000);

    expect(isOnCooldown('fireball')).toBe(true);
    expect(isOnCooldown('heal')).toBe(true);

    resetCooldowns('fireball');
    expect(isOnCooldown('fireball')).toBe(false);
    expect(isOnCooldown('heal')).toBe(true);

    resetCooldowns();
    expect(isOnCooldown('heal')).toBe(false);
  });

  it('computes correct getLocalCooldownMult based on perks', () => {
    // Default
    expect(getLocalCooldownMult()).toBe(1);

    useGameStore.setState({ sessionId: 'p1' });
    const p: Partial<PlayerView> = {
      sessionId: 'p1',
      perk1: 'quick_hands',
      perk2: '',
      perk3: '',
    };
    useGameStore.getState().players.set('p1', p as PlayerView);
    expect(getLocalCooldownMult()).toBeCloseTo(0.85);

    p.perk2 = 'rapid_fire'; // upgraded (hypothetically active at same time for test)
    expect(getLocalCooldownMult()).toBeCloseTo(0.85 * 0.70);

    p.perk3 = 'overclock';
    expect(getLocalCooldownMult()).toBeCloseTo(0.85 * 0.70 * 0.55);
  });

  it('computes correct getLocalManaCostMult based on perks', () => {
    // Default
    expect(getLocalManaCostMult()).toBe(1);

    useGameStore.setState({ sessionId: 'p1' });
    const p: Partial<PlayerView> = {
      sessionId: 'p1',
      perk1: 'arcane_reservoir',
      perk2: '',
      perk3: '',
    };
    useGameStore.getState().players.set('p1', p as PlayerView);
    expect(getLocalManaCostMult()).toBeCloseTo(0.85);

    p.perk2 = 'infinite_power';
    expect(getLocalManaCostMult()).toBeCloseTo(0.85 * 0.70);
  });
});
