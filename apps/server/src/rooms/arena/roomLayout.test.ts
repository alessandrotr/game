import { describe, expect, it } from 'vitest';
import { generateRoomLayout, clampToUnlockedArea } from '@arena/shared';

describe('Room Expansion — Cardinal Hub-and-Spoke Layout', () => {
  const seed = 12345;
  const layout = generateRoomLayout(seed);

  it('generates 4 sections and 4 doors', () => {
    expect(layout.sections.length).toBe(4);
    expect(layout.doors.length).toBe(4);
  });

  it('sections extend in four directions', () => {
    // North (0): z starts at 25, extends to 75
    const sNorth = layout.sections[0]!;
    expect(sNorth.bounds.minZ).toBeGreaterThanOrEqual(25);
    expect(sNorth.bounds.maxZ).toBeLessThanOrEqual(75);

    // East (1): x starts at 25, extends to 75
    const sEast = layout.sections[1]!;
    expect(sEast.bounds.minX).toBeGreaterThanOrEqual(25);
    expect(sEast.bounds.maxX).toBeLessThanOrEqual(75);

    // South (2): z extends from -25 down to -75
    const sSouth = layout.sections[2]!;
    expect(sSouth.bounds.minZ).toBeGreaterThanOrEqual(-75);
    expect(sSouth.bounds.maxZ).toBeLessThanOrEqual(-25);

    // West (3): x extends from -25 down to -75
    const sWest = layout.sections[3]!;
    expect(sWest.bounds.minX).toBeGreaterThanOrEqual(-75);
    expect(sWest.bounds.maxX).toBeLessThanOrEqual(-25);
  });

  it('doors are at section boundaries', () => {
    expect(layout.doors[0]!.z).toBe(25);   // North door
    expect(layout.doors[0]!.isVertical).toBe(false);
    
    expect(layout.doors[1]!.x).toBe(25);   // East door
    expect(layout.doors[1]!.isVertical).toBe(true);
    
    expect(layout.doors[2]!.z).toBe(-25);  // South door
    expect(layout.doors[2]!.isVertical).toBe(false);
    
    expect(layout.doors[3]!.x).toBe(-25);  // West door
    expect(layout.doors[3]!.isVertical).toBe(true);
  });

  it('clamps to main room when no sections unlocked (North direction)', () => {
    // Trying to move north from z=24 to z=26 at x=0 (in door gap)
    // Should be blocked because section is locked
    const res = clampToUnlockedArea(0, 26, layout, 0, 0.6, 0, 24);
    expect(res.z).toBeCloseTo(24.4); // z = 25 - radius (0.6)
    expect(res.x).toBe(0);
  });

  it('allows passage through North door when North wing is unlocked', () => {
    // Trying to move north from z=24 to z=26 at x=0 (in door gap)
    // Should be allowed because North wing (index 0) is unlocked
    const res = clampToUnlockedArea(0, 26, layout, 1, 0.6, 0, 24);
    expect(res.z).toBe(26); // allowed through!
    expect(res.x).toBe(0);
  });

  it('blocks passage outside North door gap even when North wing is unlocked', () => {
    // Trying to move north from z=24 to z=26 at x=20 (outside door gap [-6, 6])
    // Should be blocked
    const res = clampToUnlockedArea(20, 26, layout, 1, 0.6, 20, 24);
    expect(res.z).toBeCloseTo(24.4); // blocked by the wall
    expect(res.x).toBe(20);
  });

  it('allows passage through East door when East wing is unlocked', () => {
    // East door is at x=25, gap is z ∈ [-6, 6]
    // Move from x=24 to x=26 at z=0
    // Allowed when unlockedSections >= 2 (North and East are unlocked)
    const res = clampToUnlockedArea(26, 0, layout, 2, 0.6, 24, 0);
    expect(res.x).toBe(26); // allowed through!
    expect(res.z).toBe(0);
  });

  it('clamps to East wing box when outside East bounds', () => {
    // Player inside East wing (x=30, z=30) which is outside any template bounds
    // Should be pushed to nearest allowed point in the wing
    const res = clampToUnlockedArea(30, 30, layout, 2, 0.6, 30, 30);
    expect(res.z).toBeLessThanOrEqual(25);
  });

  it('no dead zone at East door boundary (transition x=24.4 to x=25)', () => {
    const res = clampToUnlockedArea(24.8, 0, layout, 2, 0.6, 24, 0);
    expect(res.x).toBeCloseTo(24.8);
    expect(res.z).toBe(0);
  });
});
