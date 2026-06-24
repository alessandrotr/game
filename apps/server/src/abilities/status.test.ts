import { describe, expect, it } from 'vitest';
import {
  attackSpeedMultiplier,
  damageTakenMultiplier,
  isRooted,
  isSilenced,
  isStunned,
  isBlinded,
  moveSpeedMultiplier,
  type StatusLike,
} from '@arena/shared';

const carrier = (...statuses: StatusLike[]) => ({ statuses });

describe('status gating helpers', () => {
  it('a stun reads as stunned, rooted, and silenced (it blocks everything)', () => {
    const c = carrier({ kind: 'stun', magnitude: 0 });
    expect(isStunned(c)).toBe(true);
    expect(isRooted(c)).toBe(true);
    expect(isSilenced(c)).toBe(true);
  });

  it('a root blocks movement only (not casting)', () => {
    const c = carrier({ kind: 'root', magnitude: 0 });
    expect(isRooted(c)).toBe(true);
    expect(isStunned(c)).toBe(false);
    expect(isSilenced(c)).toBe(false);
  });

  it('a silence blocks casting only (not movement)', () => {
    const c = carrier({ kind: 'silence', magnitude: 0 });
    expect(isSilenced(c)).toBe(true);
    expect(isRooted(c)).toBe(false);
  });

  it('a blind blocks casting and attacking (not movement)', () => {
    const c = carrier({ kind: 'blind', magnitude: 0 });
    expect(isSilenced(c)).toBe(true);
    expect(isBlinded(c)).toBe(true);
    expect(isRooted(c)).toBe(false);
    expect(isStunned(c)).toBe(false);
  });

  it('no statuses means free to act', () => {
    const c = carrier();
    expect(isStunned(c) || isRooted(c) || isSilenced(c) || isBlinded(c)).toBe(false);
  });
});

describe('stat multipliers', () => {
  it('slow and haste stack multiplicatively', () => {
    expect(moveSpeedMultiplier(carrier({ kind: 'slow', magnitude: 0.5 }))).toBeCloseTo(0.5);
    expect(moveSpeedMultiplier(carrier({ kind: 'haste', magnitude: 1.3 }))).toBeCloseTo(1.3);
    const both = carrier({ kind: 'slow', magnitude: 0.5 }, { kind: 'haste', magnitude: 1.3 });
    expect(moveSpeedMultiplier(both)).toBeCloseTo(0.65);
  });

  it('defaults to 1 (no modifier) when absent', () => {
    expect(moveSpeedMultiplier(carrier())).toBe(1);
    expect(attackSpeedMultiplier(carrier())).toBe(1);
    expect(damageTakenMultiplier(carrier())).toBe(1);
  });

  it('attack-speed and damage-amp apply their magnitudes', () => {
    expect(attackSpeedMultiplier(carrier({ kind: 'attack_speed', magnitude: 1.5 }))).toBeCloseTo(1.5);
    expect(damageTakenMultiplier(carrier({ kind: 'damage_amp', magnitude: 1.2 }))).toBeCloseTo(1.2);
  });
});
