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

  it('keeps locomotion when moving, overriding a transient one-shot', () => {
    // The fix for the "cast/hit while running freezes the pose and slides" bug:
    // movement wins, so an instant cast taken mid-run stays Run.
    expect(
      computeAnimState({
        alive: true,
        moving: true,
        oneShot: { name: 'cast', until: 500 },
        now: 200,
      }),
    ).toBe('run');
  });

  it('plays an unexpired one-shot while stationary', () => {
    expect(
      computeAnimState({
        alive: true,
        moving: false,
        oneShot: { name: 'cast', until: 500 },
        now: 200,
      }),
    ).toBe('cast');
  });

  it('ignores an expired one-shot and falls back to locomotion', () => {
    expect(
      computeAnimState({
        alive: true,
        moving: false,
        oneShot: { name: 'hit', until: 500 },
        now: 600,
      }),
    ).toBe('idle');
    expect(
      computeAnimState({
        alive: true,
        moving: true,
        oneShot: { name: 'hit', until: 500 },
        now: 600,
      }),
    ).toBe('run');
  });

  it('chooses run / idle by movement when there is no one-shot', () => {
    const base = { alive: true, oneShot: null, now: 0 };
    expect(computeAnimState({ ...base, moving: true })).toBe('run');
    expect(computeAnimState({ ...base, moving: false })).toBe('idle');
  });
});
