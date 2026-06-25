import { describe, expect, it } from 'vitest';
import {
  IDENTITY_MODIFIERS,
  ServerMessage,
  ZOMBIE_SKIN_ID,
  computePerkModifiers,
  type PerkModifiers,
} from '@arena/shared';
import { Player } from '../../schema';
import { CombatSystem } from './combat';
import type { ArenaContext } from '../context';

// ---------------------------------------------------------------------------
// computePerkModifiers — the shared data-driven fold (single source of truth)
// ---------------------------------------------------------------------------

describe('computePerkModifiers', () => {
  it('returns identity for no perks', () => {
    expect(computePerkModifiers([])).toEqual(IDENTITY_MODIFIERS);
  });

  it('reads a single perk straight off its data', () => {
    expect(computePerkModifiers(['thick_skin']).maxHpMult).toBeCloseTo(1.15);
    expect(computePerkModifiers(['quick_hands']).cooldownMult).toBeCloseTo(0.85);
    expect(computePerkModifiers(['wide_reach']).aoeSizeBonus).toBe(1);
  });

  it('stacks damage-taken reduction multiplicatively across different chains', () => {
    // Unstoppable (0.85, durability) × Colossus (0.70, toughness) = 0.595.
    const m = computePerkModifiers(['unstoppable', 'colossus']);
    expect(m.damageTakenMult).toBeCloseTo(0.85 * 0.7);
  });

  it('sums additive bonuses (move speed)', () => {
    // Two move-speed sources can't co-exist (same chain), but the fold itself
    // must add — verify with the low-HP flat bonus + base move bonus separately.
    expect(computePerkModifiers(['wind_runner']).moveSpeedBonus).toBe(2);
  });

  it('ORs boolean flags', () => {
    expect(computePerkModifiers(['unstoppable']).stunImmune).toBe(true);
    expect(computePerkModifiers(['last_stand']).lowHpStunImmune).toBe(true);
    expect(computePerkModifiers(['thick_skin']).stunImmune).toBe(false);
  });

  it('exposes the now-live legendary secondary effects as data', () => {
    expect(computePerkModifiers(['colossus']).reflectDamage).toBe(10);
    expect(computePerkModifiers(['colossus']).auraDps).toBe(3);
    expect(computePerkModifiers(['infinite_power']).manaPerKill).toBe(5);
    expect(computePerkModifiers(['archmage']).abilityBurnDamage).toBe(4);
    expect(computePerkModifiers(['stoneskin']).reflectDamage).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// CombatSystem — the effects that were previously dead code
// ---------------------------------------------------------------------------

interface Broadcast {
  type: string | number;
  message: any;
}

const makeCtx = (
  mods: Map<string, PerkModifiers>,
  broadcasts: Broadcast[],
): ArenaContext => {
  const players = new Map<string, Player>();
  return {
    state: { players, zombieMode: true } as any,
    tuning: { classStats: { warrior: { health: 100 } } } as any,
    obstacles: [],
    now: () => 1000,
    broadcast: (type, message) => broadcasts.push({ type, message }),
    send: () => {},
    setTimeout: () => {},
    disconnect: () => {},
    destinations: new Map(),
    animOneShots: new Map(),
    attackTargets: new Map(),
    respawnAt: new Map(),
    displacements: new Map(),
    perkModifiers: (id: string) => mods.get(id) ?? IDENTITY_MODIFIERS,
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

const damageEvents = (b: Broadcast[]) =>
  b.filter((e) => e.type === ServerMessage.Damage).map((e) => e.message);

describe('CombatSystem perk effects', () => {
  it('Infinite Power refunds mana on a zombie kill', () => {
    const mods = new Map<string, PerkModifiers>([
      ['k', computePerkModifiers(['infinite_power'])],
    ]);
    const broadcasts: Broadcast[] = [];
    const ctx = makeCtx(mods, broadcasts);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const killer = human('k', { mana: 10 });
    const target = zombie('z', { hp: 5 });
    ctx.state.players.set('k', killer);
    ctx.state.players.set('z', target);

    combat.dealDamage(target, 100, 'k', 'fireball');

    expect(target.alive).toBe(false);
    expect(killer.mana).toBe(15); // 10 + 5 refund, clamped under maxMana
  });

  it('Archmage leaves a burn DoT on an ability hit', () => {
    const mods = new Map<string, PerkModifiers>([
      ['a', computePerkModifiers(['archmage'])],
    ]);
    const ctx = makeCtx(mods, []);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const attacker = human('a');
    const target = zombie('z', { hp: 500 });
    ctx.state.players.set('a', attacker);
    ctx.state.players.set('z', target);

    combat.dealDamage(target, 10, 'a', 'fireball');

    const burn = target.statuses.find((s) => s.ability === 'burn');
    expect(burn).toBeDefined();
    expect(burn?.kind).toBe('dot');
    expect(burn?.tickAmount).toBe(4);
  });

  it('does not seed burn from inert perk damage (no infinite refresh)', () => {
    const mods = new Map<string, PerkModifiers>([
      ['a', computePerkModifiers(['archmage'])],
    ]);
    const ctx = makeCtx(mods, []);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const attacker = human('a');
    const target = zombie('z', { hp: 500 });
    ctx.state.players.set('a', attacker);
    ctx.state.players.set('z', target);

    // A burn tick (ability 'burn') must NOT apply another burn.
    combat.dealDamage(target, 4, 'a', 'burn');
    expect(target.statuses.find((s) => s.ability === 'burn')).toBeUndefined();
  });

  it('reflect/aura damage is inert: never crits and is not scaled by ability power', () => {
    // Attacker has guaranteed crit + big ability-power, but reflect must ignore both.
    const loaded: PerkModifiers = {
      ...computePerkModifiers(['archmage']), // abilityDamageMult 1.5
      critChance: 1,
      critMultiplier: 3,
    };
    const mods = new Map<string, PerkModifiers>([['a', loaded]]);
    const broadcasts: Broadcast[] = [];
    const ctx = makeCtx(mods, broadcasts);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const attacker = human('a');
    const target = zombie('z', { hp: 500 });
    ctx.state.players.set('a', attacker);
    ctx.state.players.set('z', target);

    combat.dealDamage(target, 10, 'a', 'reflect');

    const ev = damageEvents(broadcasts).at(-1);
    expect(ev.amount).toBe(10); // flat, unscaled
    expect(ev.crit).toBe(false);
  });

  it('a real ability still crits and scales for comparison', () => {
    const loaded: PerkModifiers = {
      ...IDENTITY_MODIFIERS,
      critChance: 1,
      critMultiplier: 2,
    };
    const mods = new Map<string, PerkModifiers>([['a', loaded]]);
    const broadcasts: Broadcast[] = [];
    const ctx = makeCtx(mods, broadcasts);
    const combat = new CombatSystem(ctx, { recordKill: () => {} } as any);
    const attacker = human('a');
    const target = zombie('z', { hp: 500 });
    ctx.state.players.set('a', attacker);
    ctx.state.players.set('z', target);

    combat.dealDamage(target, 10, 'a', 'fireball');

    const ev = damageEvents(broadcasts).at(-1);
    expect(ev.amount).toBe(20); // 10 × crit 2
    expect(ev.crit).toBe(true);
  });
});
