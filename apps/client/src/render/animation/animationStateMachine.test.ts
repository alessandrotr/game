import { describe, expect, it } from 'vitest';
import { createCharacterFSM } from './animationStateMachine';

const FRAME = 1000 / 60;
const still = { speed: 0, alive: true, event: null as null };
// Single move speed: any movement is Run.
const moving = { speed: 5, alive: true, event: null as null };

describe('createCharacterFSM', () => {
  it('picks Idle when still and Run when moving (single move speed)', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step(still, FRAME)).toBe('idle');
    expect(fsm.step(moving, FRAME)).toBe('run');
  });

  it('uses the speed threshold (slow drift stays Idle)', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step({ speed: 0.3, alive: true, event: null }, FRAME)).toBe('idle');
    expect(fsm.step({ speed: 0.7, alive: true, event: null }, FRAME)).toBe('run');
  });

  it('plays a one-shot event then falls back to locomotion', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step({ ...moving, event: 'cast' }, FRAME)).toBe('cast');
    // Still within the cast duration → keeps casting even while moving.
    expect(fsm.step(moving, FRAME)).toBe('cast');
    // Advance past the one-shot duration → back to run (still moving).
    expect(fsm.step(moving, 1000)).toBe('run');
  });

  it('lets a newer event interrupt an in-progress one-shot', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step({ ...still, event: 'cast' }, FRAME)).toBe('cast');
    expect(fsm.step({ ...still, event: 'hit' }, FRAME)).toBe('hit');
  });

  it('plays an emote (dance) while still, and movement cancels it', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step({ ...still, event: 'dance1' }, FRAME)).toBe('dance1');
    // Keeps dancing while standing.
    expect(fsm.step(still, FRAME)).toBe('dance1');
    // Moving cancels the dance immediately → back to locomotion.
    expect(fsm.step(moving, FRAME)).toBe('run');
  });

  it('latches Death over everything until revival', () => {
    const fsm = createCharacterFSM();
    fsm.step({ ...moving, event: 'attack' }, FRAME);
    expect(fsm.step({ speed: 5, alive: false, event: 'cast' }, FRAME)).toBe('die');
    // Stays dead regardless of inputs.
    expect(fsm.step({ speed: 5, alive: false, event: null }, 1000)).toBe('die');
    // Revived → returns to locomotion.
    expect(fsm.step(still, FRAME)).toBe('idle');
  });

  it('exposes the current animation', () => {
    const fsm = createCharacterFSM();
    expect(fsm.current).toBe('idle');
    fsm.step(moving, FRAME);
    expect(fsm.current).toBe('run');
  });
});
