import { describe, expect, it, vi } from 'vitest';
import { Player, CoverStructure, Pickable } from '../../schema';
import { CoverSystem } from './cover';
import { PickableSystem } from './pickables';
import { CombatSystem } from './combat';
import { GroundZoneSystem } from './groundZones';
import type { ArenaContext } from '../context';

const makeMockContext = (over: Partial<ArenaContext> = {}): ArenaContext => {
  const players = new Map<string, Player>();
  const pickables = new Map<string, Pickable>();
  const structures = new Map<string, CoverStructure>();
  const groundZones = new Map<string, any>();
  const state = {
    players,
    pickables,
    structures,
    groundZones,
    zombieMode: false,
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
    setTimeout: (cb: () => void) => cb(),
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

describe('Treasure Chest Spawning & Gameplay', () => {
  it('spawns a chest, damages it, crumbles it, and drops a heal pack', () => {
    const ctx = makeMockContext();
    const combat = new CombatSystem(ctx, { outcomeFor: () => 'draw' } as any);
    const pickables = new PickableSystem(ctx, combat, {} as any, {} as any);
    const mockPhysics = {
      addStaticBox: vi.fn(() => ({}) as any),
      addStaticCylinder: vi.fn(() => ({}) as any),
      removeCollider: vi.fn(),
    } as any;

    const obstacles: any[] = [];
    const cover = new CoverSystem(ctx, obstacles, combat, mockPhysics);
    
    // Wire chest destruction callback
    cover.onChestDestroyed((cx, cz) => pickables.spawnGround('heal_pack', cx, cz, 4));

    // Spawn a chest at (10, 20) with rotation 0
    const chestId = cover.spawnChest(10, 20, 0);

    // Verify it is registered in the state
    const chest = ctx.state.structures.get(chestId);
    expect(chest).toBeDefined();
    expect(chest?.assetId).toBe('prop.arena.chest');
    expect(chest?.hp).toBe(80);
    expect(chest?.destroyed).toBe(false);

    // Verify physics collider was created
    expect(mockPhysics.addStaticBox).toHaveBeenCalledWith(10, 20, 1.0, 0.5, 1.5, 0);

    // Verify collision footprint obstacles were added
    expect(obstacles.length).toBeGreaterThan(0);

    // Deal 40 damage
    cover.damage(chestId, 40);
    expect(chest?.hp).toBe(40);
    expect(chest?.destroyed).toBe(false);
    expect(ctx.state.pickables.size).toBe(0);

    // Deal 45 damage (bringing it below 0 HP)
    cover.damage(chestId, 45);
    expect(ctx.state.structures.get(chestId)).toBeUndefined();

    // Verify physics collider was removed
    expect(mockPhysics.removeCollider).toHaveBeenCalled();

    // Verify collision footprint obstacles were removed
    expect(obstacles.length).toBe(0);

    // Verify a heal pack of scale 4 was dropped at (10, 20)
    expect(ctx.state.pickables.size).toBe(1);
    const dropId = Array.from(ctx.state.pickables.keys())[0];
    const pack = ctx.state.pickables.get(dropId);
    expect(pack?.kind).toBe('heal_pack');
    expect(pack?.x).toBe(10);
    expect(pack?.z).toBe(20);
    expect(pack?.scale).toBe(4);
  });

  it('damages cover structures, barrels, and destructibles when a singularity trap explodes', () => {
    const ctx = makeMockContext();
    const combat = new CombatSystem(ctx, { outcomeFor: () => 'draw' } as any);
    const mockPhysics = {
      addStaticBox: vi.fn(() => ({}) as any),
      addStaticCylinder: vi.fn(() => ({}) as any),
      removeCollider: vi.fn(),
    } as any;

    const obstacles: any[] = [];
    const cover = new CoverSystem(ctx, obstacles, combat, mockPhysics);
    combat.attachCover(cover);

    const mockDestructibles = {
      pushInRadius: vi.fn(),
    } as any;
    const mockBarrels = {
      triggerInRadius: vi.fn(),
    } as any;
    combat.attachDestructibles(mockDestructibles);
    combat.attachBarrels(mockBarrels);

    const groundZones = new GroundZoneSystem(ctx, combat);

    // Spawn a chest structure (HP = 80) at (0, 0)
    const chestId = cover.spawnChest(0, 0, 0);
    const chest = ctx.state.structures.get(chestId);
    expect(chest).toBeDefined();

    // Spawn a singularity ground zone at (0, 0) with radius 5, ending in 1000ms
    groundZones.spawn('singularity', 0, 0, 5, 0, 1000, 1000, '');

    // Verify it is in state
    expect(ctx.state.groundZones.size).toBe(1);

    // Fast-forward context time to trigger expiration/detonation in groundZones.update()
    vi.spyOn(ctx, 'now').mockReturnValue(2500);
    groundZones.update();

    // Verify singularity expired (removed from state)
    expect(ctx.state.groundZones.size).toBe(0);

    // Verify chest took 80 damage (bringing it below 0 HP) and got deleted/destroyed
    expect(ctx.state.structures.get(chestId)).toBeUndefined();

    // Verify barrels and destructibles systems were triggered in radius
    expect(mockDestructibles.pushInRadius).toHaveBeenCalledWith(0, 0, 5, '', 200);
    expect(mockBarrels.triggerInRadius).toHaveBeenCalledWith(0, 0, 5, '');
  });
});
