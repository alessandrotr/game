import { describe, expect, it } from 'vitest';
import {
  generateRoomLayout,
  clampToUnlockedArea,
  randomSpawnPoint,
  unlockedPlayArea,
  type SectionDef,
} from '@arena/shared';

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

describe('Spawn distribution — randomSpawnPoint / unlockedPlayArea', () => {
  const H = 25; // ARENA_HALF_SIZE
  const layout = generateRoomLayout(12345);

  // Deterministic PRNG so the distribution assertions are stable in CI.
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const inBox = (x: number, z: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
    x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

  // Centroid of a section's largest box (mirrors the private sectionCenter).
  const largestBoxCenter = (s: SectionDef) => {
    let best = s.boxes[0]!;
    let bestArea = -Infinity;
    for (const b of s.boxes) {
      const a = (b.maxX - b.minX) * (b.maxZ - b.minZ);
      if (a > bestArea) { bestArea = a; best = b; }
    }
    return { x: (best.minX + best.maxX) / 2, z: (best.minZ + best.maxZ) / 2 };
  };

  it('falls back to the main room when layout is null', () => {
    const r = rng(1);
    for (let i = 0; i < 500; i++) {
      const p = randomSpawnPoint(null, 0, 0.6, r)!;
      expect(p).not.toBeNull();
      expect(Math.abs(p.x)).toBeLessThanOrEqual(H);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(H);
    }
  });

  it('with sections unlocked, every point lands inside a valid box (main + unlocked)', () => {
    const unlocked = 4;
    const r = rng(2);
    for (let i = 0; i < 2000; i++) {
      const p = randomSpawnPoint(layout, unlocked, 0.6, r)!;
      const eps = 1e-6;
      const inMain = inBox(p.x, p.z, { minX: -H, maxX: H, minZ: -H, maxZ: H });
      const inSection = layout.sections
        .slice(0, unlocked)
        .some((s) => s.boxes.some((b) => inBox(p.x, p.z, {
          minX: b.minX - eps, maxX: b.maxX + eps, minZ: b.minZ - eps, maxZ: b.maxZ + eps,
        })));
      expect(inMain || inSection).toBe(true);
    }
  });

  it('never samples inside a locked section', () => {
    const r = rng(3);
    let outsideMain = 0;
    for (let i = 0; i < 2000; i++) {
      const p = randomSpawnPoint(layout, 1, 0.6, r)!; // only North (index 0) unlocked
      const inMain = Math.abs(p.x) <= H && Math.abs(p.z) <= H;
      if (!inMain) {
        outsideMain++;
        // Must be in section 0's boxes, never in 1/2/3.
        const inNorth = layout.sections[0]!.boxes.some((b) => inBox(p.x, p.z, b));
        expect(inNorth).toBe(true);
      }
    }
    expect(outsideMain).toBeGreaterThan(0); // the wing does receive spawns
  });

  it('respects the centre-exclusion reserve in every unlocked wing', () => {
    const reserve = 6;
    const r = rng(4);
    const centers = layout.sections.map(largestBoxCenter);
    for (let i = 0; i < 3000; i++) {
      const p = randomSpawnPoint(layout, 4, 0.6, r, reserve)!;
      for (const c of centers) {
        const d2 = (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
        expect(d2).toBeGreaterThanOrEqual(reserve * reserve - 1e-6);
      }
    }
  });

  it('spreads spawns into the wings (not just the main room)', () => {
    const r = rng(5);
    let inWings = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const p = randomSpawnPoint(layout, 4, 0.6, r)!;
      if (Math.abs(p.x) > H || Math.abs(p.z) > H) inWings++;
    }
    // Wings make up the majority of the unlocked area, so most points land there.
    expect(inWings / N).toBeGreaterThan(0.5);
  });

  it('unlockedPlayArea = main room only when nothing is unlocked', () => {
    expect(unlockedPlayArea(null, 0)).toBe(2500); // 50×50
    expect(unlockedPlayArea(layout, 0)).toBe(2500);
  });

  it('unlockedPlayArea grows monotonically as wings unlock', () => {
    let prev = unlockedPlayArea(layout, 0);
    for (let n = 1; n <= 4; n++) {
      const area = unlockedPlayArea(layout, n);
      expect(area).toBeGreaterThan(prev);
      prev = area;
    }
  });

  it('barrel-capacity formula scales density roughly constant', () => {
    // capacity = clamp(round(area / 250), 10, 60) — main room alone yields 10.
    const cap = (area: number) => Math.max(10, Math.min(60, Math.round(area / 250)));
    expect(cap(unlockedPlayArea(layout, 0))).toBe(10);
    expect(cap(unlockedPlayArea(layout, 4))).toBeGreaterThan(10);
    expect(cap(unlockedPlayArea(layout, 4))).toBeLessThanOrEqual(60);
  });
});
