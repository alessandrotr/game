import { describe, expect, it } from 'vitest';
import { applyDamage, applyHeal, regenMana, reviveFull, spendMana, type CombatEntity } from './combat';

const makeEntity = (over: Partial<CombatEntity> = {}): CombatEntity => ({
  hp: 100,
  maxHp: 100,
  mana: 100,
  maxMana: 100,
  alive: true,
  ...over,
});

describe('applyDamage', () => {
  it('subtracts HP and reports the amount applied', () => {
    const e = makeEntity();
    expect(applyDamage(e, 30)).toEqual({ applied: 30, lethal: false });
    expect(e.hp).toBe(70);
  });

  it('clamps at 0, marks dead, and reports a lethal blow (applied = remaining HP)', () => {
    const e = makeEntity({ hp: 20 });
    expect(applyDamage(e, 50)).toEqual({ applied: 20, lethal: true });
    expect(e.hp).toBe(0);
    expect(e.alive).toBe(false);
  });

  it('does nothing to a dead entity or for non-positive amounts', () => {
    const dead = makeEntity({ hp: 0, alive: false });
    expect(applyDamage(dead, 10)).toEqual({ applied: 0, lethal: false });
    const e = makeEntity();
    expect(applyDamage(e, 0)).toEqual({ applied: 0, lethal: false });
    expect(e.hp).toBe(100);
  });
});

describe('applyHeal', () => {
  it('restores HP and reports the amount healed, clamping at maxHp', () => {
    const e = makeEntity({ hp: 70 });
    expect(applyHeal(e, 20)).toBe(20);
    expect(applyHeal(e, 100)).toBe(10); // 90 -> 100, only 10 applied
    expect(e.hp).toBe(100);
  });

  it('does not heal the dead', () => {
    const e = makeEntity({ hp: 0, alive: false });
    expect(applyHeal(e, 50)).toBe(0);
    expect(e.hp).toBe(0);
  });
});

describe('spendMana', () => {
  it('spends when affordable and refuses (spending nothing) otherwise', () => {
    const e = makeEntity({ mana: 30 });
    expect(spendMana(e, 20)).toBe(true);
    expect(e.mana).toBe(10);
    expect(spendMana(e, 20)).toBe(false);
    expect(e.mana).toBe(10);
  });
});

describe('regenMana', () => {
  it('regenerates over time and clamps at maxMana, but not while dead', () => {
    const e = makeEntity({ mana: 50 });
    regenMana(e, 12, 1); // +12
    expect(e.mana).toBe(62);
    regenMana(e, 100, 1); // clamps
    expect(e.mana).toBe(100);
    const dead = makeEntity({ mana: 50, alive: false });
    regenMana(dead, 12, 1);
    expect(dead.mana).toBe(50);
  });
});

describe('reviveFull', () => {
  it('restores full HP/mana and marks alive', () => {
    const e = makeEntity({ hp: 0, mana: 0, alive: false });
    reviveFull(e);
    expect(e).toMatchObject({ hp: 100, mana: 100, alive: true });
  });
});
