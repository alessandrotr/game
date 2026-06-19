import { describe, expect, it } from 'vitest';
import { generateRoomLayout, clampToUnlockedArea } from '@arena/shared';

describe('Room Expansion Walls and Collisions', () => {
  it('correctly clamps positions and prevents passing through locked doors/walls', () => {
    const seed = 12345;
    const layout = generateRoomLayout(seed);

    // Left wall of main room: x = -25.
    // If unlockedSections is 0 (all sections locked):
    // Trying to move from x = -24 (inside) to x = -26 (outside) at z = 15.
    // Crossing point is at z = 15, which is outside door gap [2, 8] and Section 1 is locked.
    const res1 = clampToUnlockedArea(-26, 15, layout, 0, 0.6, -24, 15);
    expect(res1.x).toBeCloseTo(-24.4); // -25 + radius (0.6)
    expect(res1.z).toBe(15);

    // Even if trying to cross at z = 5 (door center) when Section 1 is locked (unlockedSections = 0):
    const res2 = clampToUnlockedArea(-26, 5, layout, 0, 0.6, -24, 5);
    expect(res2.x).toBeCloseTo(-24.4); // still blocked because section is locked

    // When Section 1 is unlocked (unlockedSections = 1):
    // Crossing at z = 5 (inside door gap) should be allowed!
    const res3 = clampToUnlockedArea(-26, 5, layout, 1, 0.6, -24, 5);
    expect(res3.x).toBe(-26); // allowed!

    // Crossing at z = 15 (outside door gap) should still be blocked even if Section 1 is unlocked!
    const res4 = clampToUnlockedArea(-26, 15, layout, 1, 0.6, -24, 15);
    expect(res4.x).toBeCloseTo(-24.4); // blocked by the wall
  });
});
