import { describe, expect, it } from 'vitest';
import type { Effect, LeafEffect, StatusSpec } from '@arena/shared';
import { runCast, type CastContext, type EffectActor, type EffectRuntime } from './executor';

/** A minimal actor — the executor only reads sessionId/x/z. */
const actor = (sessionId: string, x = 0, z = 0) =>
  ({ sessionId, x, z }) as unknown as EffectActor;

/** A runtime that records every side effect the executor requests. */
function recordingRuntime() {
  const calls = {
    damage: [] as { target: string; amount: number; from: string }[],
    heal: [] as { target: string; amount: number }[],
    shield: [] as { target: string; amount: number }[],
    status: [] as { target: string; spec: StatusSpec }[],
    displace: [] as { id: string; dirX: number; dirZ: number; distance: number }[],
    projectile: [] as { owner: string; vfx: string; onHit: LeafEffect[] }[],
  };
  const enemies: EffectActor[] = [];
  const rt: EffectRuntime = {
    dealDamage: (t, a, f) => calls.damage.push({ target: t.sessionId, amount: a, from: f }),
    heal: (t, a) => calls.heal.push({ target: t.sessionId, amount: a }),
    addShield: (t, a) => calls.shield.push({ target: t.sessionId, amount: a }),
    applyStatus: (t, s) => calls.status.push({ target: t.sessionId, spec: s }),
    displace: (e, dirX, dirZ, distance) =>
      calls.displace.push({ id: e.sessionId, dirX, dirZ, distance }),
    spawnProjectile: (o, vfx, _dx, _dz, _sp, _r, _rad, onHit) =>
      calls.projectile.push({ owner: o.sessionId, vfx, onHit }),
    forEachEnemyInRadius: (_x, _z, _r, _except, fn) => enemies.forEach(fn),
    triggerBarrelsInRadius: () => {},
  };
  return { rt, calls, enemies };
}

const ctx = (over: Partial<CastContext> = {}): CastContext => ({
  caster: actor('caster'),
  dirX: 0,
  dirZ: 1,
  ...over,
});

describe('runCast — top-level effect dispatch', () => {
  it('a bare leaf with no unit target applies to the caster (self-buff)', () => {
    const { rt, calls } = recordingRuntime();
    const effects: Effect[] = [
      { type: 'shield', amount: 50, durationMs: 4000 },
      { type: 'status', status: { kind: 'haste', durationMs: 3000, magnitude: 1.3 } },
    ];
    runCast(effects, ctx(), rt);
    expect(calls.shield).toEqual([{ target: 'caster', amount: 50 }]);
    expect(calls.status[0]?.target).toBe('caster');
  });

  it('a bare leaf with a unit target lands on that target', () => {
    const { rt, calls } = recordingRuntime();
    const effects: Effect[] = [
      { type: 'damage', amount: 35 },
      { type: 'status', status: { kind: 'stun', durationMs: 1500 } },
    ];
    runCast(effects, ctx({ unitTarget: actor('victim', 5, 0) }), rt);
    expect(calls.damage).toEqual([{ target: 'victim', amount: 35, from: 'caster' }]);
    expect(calls.status).toEqual([
      { target: 'victim', spec: { kind: 'stun', durationMs: 1500 } },
    ]);
  });

  it('a dash displaces the caster along the aim direction', () => {
    const { rt, calls } = recordingRuntime();
    runCast([{ type: 'dash', distance: 10, speed: 30 }], ctx({ dirX: 1, dirZ: 0 }), rt);
    expect(calls.displace).toEqual([{ id: 'caster', dirX: 1, dirZ: 0, distance: 10 }]);
  });

  it('a projectile carries its onHit effects to the runtime', () => {
    const { rt, calls } = recordingRuntime();
    const onHit: LeafEffect[] = [{ type: 'damage', amount: 30 }];
    runCast(
      [{ type: 'projectile', speed: 25, range: 20, radius: 0.8, vfx: 'fireball', onHit }],
      ctx(),
      rt,
    );
    expect(calls.projectile).toEqual([{ owner: 'caster', vfx: 'fireball', onHit }]);
    // The projectile hasn't hit anything yet, so no damage was dealt directly.
    expect(calls.damage).toHaveLength(0);
  });

  it('an AoE runs its onHit leaves against every enemy in radius', () => {
    const { rt, calls, enemies } = recordingRuntime();
    enemies.push(actor('e1', 1, 0), actor('e2', -1, 0));
    const onHit: LeafEffect[] = [
      { type: 'damage', amount: 22 },
      { type: 'status', status: { kind: 'slow', durationMs: 2000, magnitude: 0.5 } },
    ];
    runCast([{ type: 'aoe', at: 'caster', radius: 5, onHit }], ctx(), rt);
    expect(calls.damage.map((d) => d.target)).toEqual(['e1', 'e2']);
    expect(calls.status.map((s) => s.target)).toEqual(['e1', 'e2']);
  });

  it('knockback pushes the target away from the effect origin (the caster)', () => {
    const { rt, calls } = recordingRuntime();
    // Caster at origin, target to the +x side → push should be +x.
    runCast(
      [{ type: 'knockback', distance: 4, speed: 24 }],
      ctx({ unitTarget: actor('victim', 3, 0) }),
      rt,
    );
    expect(calls.displace).toHaveLength(1);
    expect(calls.displace[0]?.id).toBe('victim');
    expect(calls.displace[0]?.dirX).toBeCloseTo(1);
    expect(calls.displace[0]?.dirZ).toBeCloseTo(0);
  });
});
