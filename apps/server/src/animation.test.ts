import { describe, expect, it } from 'vitest';
import { computeAnimState } from './animation';

describe('computeAnimState', () => {
  it('returns die when not alive, overriding everything', () => {
    expect(
      computeAnimState({
        alive: false,
        moving: true,
        sprinting: true,
        oneShot: { name: 'cast', until: 1000 },
        now: 0,
      }),
    ).toBe('die');
  });

  it('plays an unexpired one-shot over locomotion', () => {
    expect(
      computeAnimState({
        alive: true,
        moving: true,
        sprinting: true,
        oneShot: { name: 'cast', until: 500 },
        now: 200,
      }),
    ).toBe('cast');
  });

  it('ignores an expired one-shot and falls back to locomotion', () => {
    expect(
      computeAnimState({
        alive: true,
        moving: true,
        sprinting: true,
        oneShot: { name: 'cast', until: 500 },
        now: 600,
      }),
    ).toBe('run');
    expect(
      computeAnimState({
        alive: true,
        moving: false,
        sprinting: false,
        oneShot: { name: 'hit', until: 500 },
        now: 600,
      }),
    ).toBe('idle');
  });

  it('chooses run (sprint) / walk / idle by movement', () => {
    const base = { alive: true, oneShot: null, now: 0 };
    expect(computeAnimState({ ...base, moving: true, sprinting: true })).toBe('run');
    expect(computeAnimState({ ...base, moving: true, sprinting: false })).toBe('walk');
    expect(computeAnimState({ ...base, moving: false, sprinting: false })).toBe('idle');
  });
});
