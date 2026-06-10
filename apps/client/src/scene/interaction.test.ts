import { describe, expect, it } from 'vitest';
import type { NpcInstance } from '../assets/data/npcs';
import { nearestInteractable } from './interaction';

const npc = (id: string, x: number, z: number, radius = 3): NpcInstance => ({
  id,
  name: id,
  characterId: 'char.npc.guard',
  position: [x, 0, z],
  dialogueId: 'dialogue.guard',
  interactionRadius: radius,
});

describe('nearestInteractable', () => {
  const npcs = [npc('a', 10, 0), npc('b', 0, 4), npc('c', 0, 0)];

  it('returns null when nothing is in range', () => {
    expect(nearestInteractable(50, 50, npcs)).toBeNull();
  });

  it('returns the only in-range NPC', () => {
    expect(nearestInteractable(11, 0, npcs)?.id).toBe('a');
  });

  it('returns the closest when several are in range', () => {
    // (0,1): c is at dist 1, b is at dist 3 — c wins.
    expect(nearestInteractable(0, 1, npcs)?.id).toBe('c');
  });

  it('respects each NPC radius (just outside = not interactable)', () => {
    const tight = [npc('t', 0, 0, 2)];
    expect(nearestInteractable(0, 2.01, tight)).toBeNull();
    expect(nearestInteractable(0, 1.99, tight)?.id).toBe('t');
  });
});
