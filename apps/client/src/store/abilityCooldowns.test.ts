import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './useGameStore';
import {
  triggerCooldown,
  cooldownRemaining,
  isOnCooldown,
  resetCooldowns,
  getLocalCooldownMult,
  getLocalManaCostMult,
  getAbilityManaCost,
  isNinjaERecastActive,
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

  it('correctly handles ninja_e double-dash recast cooldowns and stages', () => {
    // Stage 0: E is ready, mana cost is normal
    expect(isOnCooldown('ninja_e')).toBe(false);
    expect(getAbilityManaCost('ninja_e')).toBe(20);

    const nowSpy = vi.spyOn(performance, 'now');
    
    // Start at t = 1000
    nowSpy.mockReturnValue(1000);

    // First cast of ninja_e
    triggerCooldown('ninja_e', 3000);
    // Cooldown remaining should be 314ms (until recast window opens at 1314ms)
    expect(isOnCooldown('ninja_e')).toBe(true);
    expect(cooldownRemaining('ninja_e')).toBeCloseTo(314, 0);

    // Advance time to t = 1200 (before recast window opens)
    nowSpy.mockReturnValue(1200);
    expect(isOnCooldown('ninja_e')).toBe(true);
    expect(isNinjaERecastActive()).toBe(false);
    expect(cooldownRemaining('ninja_e')).toBeCloseTo(114, 0);
    expect(getAbilityManaCost('ninja_e')).toBe(20);

    // Advance time to t = 1600 (inside recast window: 1314 to 2700)
    nowSpy.mockReturnValue(1600);
    expect(isOnCooldown('ninja_e')).toBe(false); // E is ready to recast!
    expect(isNinjaERecastActive()).toBe(true);
    expect(cooldownRemaining('ninja_e')).toBe(0);
    expect(getAbilityManaCost('ninja_e')).toBe(30); // mana cost is +10

    // Second cast of ninja_e at t = 1700 (still inside recast window 1314 to 2700)
    nowSpy.mockReturnValue(1700);
    triggerCooldown('ninja_e', 4000);
    // E goes on 6s cooldown
    expect(isOnCooldown('ninja_e')).toBe(true);
    expect(isNinjaERecastActive()).toBe(false);
    expect(cooldownRemaining('ninja_e')).toBeCloseTo(6000, 0);

    // Let's reset and test recast window expiration
    resetCooldowns();
    nowSpy.mockReturnValue(3000);
    expect(isOnCooldown('ninja_e')).toBe(false);

    // First cast of ninja_e again at t = 3000
    triggerCooldown('ninja_e', 3000);
    expect(cooldownRemaining('ninja_e')).toBeCloseTo(314, 0);

    // Let time expire past the recast window (3000 + 1700 = 4700)
    nowSpy.mockReturnValue(4800);
    // This should trigger the standard 3s cooldown from t = 4800
    expect(cooldownRemaining('ninja_e')).toBeCloseTo(3000, 0);

    nowSpy.mockRestore();
  });

  it('applies a non-additive 250ms lockout to the R ability when casting a non-R ability', () => {
    useGameStore.setState({ sessionId: 'mage_player' });
    const p: Partial<PlayerView> = {
      sessionId: 'mage_player',
      characterClass: 'mage',
      perk1: '',
      perk2: '',
      perk3: '',
    };
    useGameStore.getState().players.set('mage_player', p as PlayerView);

    // Mage R is arcane_blast, Q is fireball
    expect(cooldownRemaining('arcane_blast')).toBe(0);

    // Cast Q
    triggerCooldown('fireball', 500);
    expect(cooldownRemaining('arcane_blast')).toBeCloseTo(250, 0);

    // Cast W, shouldn't stack
    triggerCooldown('frost_nova', 5000);
    expect(cooldownRemaining('arcane_blast')).toBeCloseTo(250, 0);

    // If R is already on a larger cooldown, lockout does not reduce it or add to it
    triggerCooldown('arcane_blast', 10000);
    const beforeCast = cooldownRemaining('arcane_blast');
    triggerCooldown('fireball', 500);
    expect(cooldownRemaining('arcane_blast')).toBeCloseTo(beforeCast, 0);
  });
});
