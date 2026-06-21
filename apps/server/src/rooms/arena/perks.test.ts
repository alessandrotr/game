import { describe, expect, it } from 'vitest';
import { PerkSystem, getPerkMoveSpeedMult } from './perks';
import { Player } from '../schema';
import type { ArenaContext } from './context';
import { PERKS, type PerkId } from '@arena/shared';

const makeMockContext = (over: Partial<ArenaContext> = {}): ArenaContext => {
  const players = new Map<string, Player>();
  const state = {
    players,
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
    ...over,
  };
};

describe('PerkSystem & Adrenaline Perks', () => {
  it('prevents legendary upgrade at wave 7 and allows it at wave 9', () => {
    const ctx = makeMockContext();
    const system = new PerkSystem(ctx);
    
    // Bind context perkModifiers to system's getModifiers
    (ctx as any).perkModifiers = (id: string) => system.getModifiers(id);

    const player = new Player();
    player.sessionId = 'p1';
    player.characterClass = 'warrior';
    player.hp = 100;
    player.maxHp = 100;
    ctx.state.players.set('p1', player);

    system.init('p1');

    // 1. Roll common perk offers at wave 3
    system.onWaveClear(3);
    expect(system.hasPendingOffers()).toBe(true);

    // Pick first common (slot 0)
    const offer3 = (system as any).offers.get('p1');
    const firstPerk = offer3.visible[0]; // e.g. thick_skin
    expect(PERKS[firstPerk].tier).toBe('common');
    
    const picked3 = system.handlePick('p1', 0);
    expect(picked3).toBe(true);
    expect(system.getPerks('p1')).toContain(firstPerk);

    // 2. Fast forward to wave 6 (upgrade_rare tier)
    // Manually force the player's perks to have a common perk 'thick_skin'
    (system as any).perks.set('p1', ['thick_skin']);
    system.onWaveClear(6);
    
    const offer6 = (system as any).offers.get('p1');
    // Try to upgrade an unowned perk or a rare perk to legendary (should fail)
    // fortified (rare) upgrades to unstoppable (legendary).
    const badUpgrade = system.handlePick('p1', 0, 'fortified');
    expect(badUpgrade).toBe(false);

    // Try to upgrade a common perk to rare (thick_skin -> fortified)
    (system as any).offers.set('p1', offer6); // re-set since failed pick cleared it
    const goodUpgrade = system.handlePick('p1', 0, 'thick_skin');
    expect(goodUpgrade).toBe(true);
    expect(system.getPerks('p1')).toContain('fortified');

    // 3. Wave 7: Try to upgrade rare 'fortified' to legendary 'unstoppable' (should fail)
    // Let's give the player both 'thick_skin' (common) and 'fortified' (rare)
    (system as any).perks.set('p1', ['thick_skin', 'fortified']);
    system.onWaveClear(7);
    const offer7 = (system as any).offers.get('p1');
    expect(offer7).toBeDefined();
    expect(PERKS[offer7.visible[0]].tier).toBe('common'); // Wave 7 offers common -> rare upgrades

    // Player tries to upgrade 'fortified' (rare) to legendary.
    const illegalLegendary = system.handlePick('p1', 0, 'fortified');
    expect(illegalLegendary).toBe(false); // BLOCKED!

    // 4. Wave 9: Allowed to upgrade 'fortified' to legendary 'unstoppable'
    (system as any).perks.set('p1', ['fortified']);
    system.onWaveClear(9);
    const offer9 = (system as any).offers.get('p1');
    expect(offer9).toBeDefined();
    expect(PERKS[offer9.visible[0]].tier).toBe('rare'); // Wave 9 offers rare -> legendary upgrades

    const legalLegendary = system.handlePick('p1', 0, 'fortified');
    expect(legalLegendary).toBe(true); // ALLOWED!
    expect(system.getPerks('p1')).toContain('unstoppable');
  });

  it('correctly applies Adrenaline low-HP stat modifiers', () => {
    const ctx = makeMockContext();
    const system = new PerkSystem(ctx);
    
    const player = new Player();
    player.sessionId = 'p1';
    player.characterClass = 'warrior';
    player.hp = 100;
    player.maxHp = 100;
    ctx.state.players.set('p1', player);

    system.init('p1');

    // Set perks to frenzy (rare Adrenaline perk)
    (system as any).perks.set('p1', ['frenzy']);
    
    const mods = system.getModifiers('p1');
    expect(mods.lowHpDamageMult).toBe(1.30);
    expect(mods.lowHpSpeedMult).toBe(1.15);

    // Test getPerkMoveSpeedMult helper
    // 100% HP -> no multiplier
    player.hp = 100;
    expect(getPerkMoveSpeedMult(system, player).mult).toBeCloseTo(1.0);

    // 50% HP -> still no multiplier (needs to be < 40%)
    player.hp = 50;
    expect(getPerkMoveSpeedMult(system, player).mult).toBeCloseTo(1.0);

    // 30% HP -> multiplier applied!
    player.hp = 30;
    expect(getPerkMoveSpeedMult(system, player).mult).toBeCloseTo(1.15);
  });
});
