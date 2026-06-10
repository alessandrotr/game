import { describe, expect, it } from 'vitest';
import { createCharacterFSM } from './animationStateMachine';

const FRAME = 1000 / 60;
const still = { speed: 0, sprinting: false, alive: true, event: null as null };
// `moving` sprints (Run); `walking` moves at walk speed (Walk).
const moving = { speed: 5, sprinting: true, alive: true, event: null as null };
const walking = { speed: 5, sprinting: false, alive: true, event: null as null };

describe('createCharacterFSM', () => {
  it('picks Idle when still, Walk when walking, Run when sprinting', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step(still, FRAME)).toBe('idle');
    expect(fsm.step(walking, FRAME)).toBe('walk');
    expect(fsm.step(moving, FRAME)).toBe('run');
  });

  it('uses the speed threshold (slow drift stays Idle)', () => {
    const fsm = createCharacterFSM();
    expect(fsm.step({ speed: 0.3, sprinting: true, alive: true, event: null }, FRAME)).toBe('idle');
    expect(fsm.step({ speed: 0.7, sprinting: true, alive: true, event: null }, FRAME)).toBe('run');
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

  it('latches Death over everything until revival', () => {
    const fsm = createCharacterFSM();
    fsm.step({ ...moving, event: 'attack' }, FRAME);
    expect(fsm.step({ speed: 5, sprinting: true, alive: false, event: 'cast' }, FRAME)).toBe('die');
    // Stays dead regardless of inputs.
    expect(fsm.step({ speed: 5, sprinting: true, alive: false, event: null }, 1000)).toBe('die');
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
