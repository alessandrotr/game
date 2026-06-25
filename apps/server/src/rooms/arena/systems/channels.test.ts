import { describe, expect, it, vi } from 'vitest';
import type { AbilityDef } from '@arena/shared';
import { Player } from '../../schema';
import type { ArenaContext } from '../context';
import { ChannelSystem } from './channels';

// A priest-style sustained beam: a 2s hold, ticking every 0.5s, 12 per tick,
// reaching 10 units in a 2-wide capsule.
const BEAM = {
  id: 'priest_beam',
  channelMs: 2000,
  channelTickMs: 500,
  damage: 12,
  range: 10,
  beamWidth: 2,
} as AbilityDef;

/** A live player at (x,z), facing +X so a beam points along the +X axis. */
const livePlayer = (sessionId: string, x: number, z: number): Player => {
  const p = new Player();
  p.sessionId = sessionId;
  p.x = x;
  p.z = z;
  p.alive = true;
  p.channelDirX = 1;
  p.channelDirZ = 0;
  return p;
};

const setup = () => {
  const players = new Map<string, Player>();
  let clock = 1000;
  const ctx = {
    state: { players, structures: new Map(), barrels: new Map() },
    now: () => clock,
  } as unknown as ArenaContext;
  const combat = { dealDamage: vi.fn(), damageStructure: vi.fn() };
  const barrels = { trigger: vi.fn() };
  const destructibles = { damageInBeam: vi.fn() };
  const channels = new ChannelSystem(
    ctx,
    combat as never,
    barrels as never,
    destructibles as never,
  );
  return { channels, players, combat, advance: (ms: number) => (clock += ms) };
};

describe('ChannelSystem start/stop', () => {
  it('marks the caster channelling and reports active', () => {
    const { channels, players } = setup();
    const caster = livePlayer('a', 0, 0);
    players.set('a', caster);

    channels.start('a', caster, BEAM, 1, 0);
    expect(channels.isActive('a')).toBe(true);
    expect(caster.channelAbility).toBe('priest_beam');
    expect(caster.channelDirX).toBe(1);

    channels.stop('a');
    expect(channels.isActive('a')).toBe(false);
    expect(caster.channelAbility).toBe('');
  });
});

describe('ChannelSystem.update lifecycle', () => {
  it('auto-ends the channel once its duration elapses', () => {
    const { channels, players, advance } = setup();
    const caster = livePlayer('a', 0, 0);
    players.set('a', caster);
    channels.start('a', caster, BEAM, 1, 0);

    advance(BEAM.channelMs! + 1);
    channels.update();
    expect(channels.isActive('a')).toBe(false);
  });

  it('ends the channel if the caster dies', () => {
    const { channels, players } = setup();
    const caster = livePlayer('a', 0, 0);
    players.set('a', caster);
    channels.start('a', caster, BEAM, 1, 0);

    caster.alive = false;
    channels.update();
    expect(channels.isActive('a')).toBe(false);
  });
});

describe('ChannelSystem.update damage', () => {
  it('hits an enemy the instant it enters the beam, then again each tick', () => {
    const { channels, players, combat, advance } = setup();
    const caster = livePlayer('a', 0, 0);
    const enemy = livePlayer('b', 5, 0); // 5 units along the +X beam → inside
    players.set('a', caster);
    players.set('b', enemy);
    channels.start('a', caster, BEAM, 1, 0);

    // On-entry burst.
    channels.update();
    expect(combat.dealDamage).toHaveBeenCalledTimes(1);
    expect(combat.dealDamage).toHaveBeenLastCalledWith(enemy, BEAM.damage, 'a');

    // Same tick window → no extra hit.
    channels.update();
    expect(combat.dealDamage).toHaveBeenCalledTimes(1);

    // After one tick interval → a second hit.
    advance(BEAM.channelTickMs!);
    channels.update();
    expect(combat.dealDamage).toHaveBeenCalledTimes(2);
  });

  it('does not hit an enemy outside the beam capsule', () => {
    const { channels, players, combat } = setup();
    const caster = livePlayer('a', 0, 0);
    const enemy = livePlayer('b', 5, 5); // well off the +X axis → outside
    players.set('a', caster);
    players.set('b', enemy);
    channels.start('a', caster, BEAM, 1, 0);

    channels.update();
    expect(combat.dealDamage).not.toHaveBeenCalled();
  });
});
