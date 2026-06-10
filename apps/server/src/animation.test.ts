import { describe, expect, it } from 'vitest';
import { computeAnimState } from './animation';

describe('computeAnimState', () => {
  it('returns die when not alive, overriding everything', () => {
    expect(
      computeAnimState({
        alive: false,
        moving: true,
        oneShot: { name: 'cast', until: 1000 },
        now: 0,
      }),
    ).toBe('die');
  });

  it('plays an unexpired one-shot over locomotion', () => {
    expect(
      computeAnimState({ alive: true, moving: true, oneShot: { name: 'cast', until: 500 }, now: 200 }),
    ).toBe('cast');
  });

  it('ignores an expired one-shot and falls back to locomotion', () => {
    expect(
      computeAnimState({ alive: true, moving: true, oneShot: { name: 'cast', until: 500 }, now: 600 }),
    ).toBe('run');
    expect(
      computeAnimState({ alive: true, moving: false, oneShot: { name: 'hit', until: 500 }, now: 600 }),
    ).toBe('idle');
  });

  it('chooses run vs idle by movement when no one-shot', () => {
    expect(computeAnimState({ alive: true, moving: true, oneShot: null, now: 0 })).toBe('run');
    expect(computeAnimState({ alive: true, moving: false, oneShot: null, now: 0 })).toBe('idle');
  });
});
