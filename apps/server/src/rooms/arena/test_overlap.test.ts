import { describe, it, expect } from 'vitest';
import { generateArenaLayout, structureFootprint, generateSectionCover } from '@arena/shared';

describe('Layout Overlap Tests', () => {
  it('should generate layouts with 0 overlaps', () => {
    let overlapCount = 0;
    let totalStructures = 0;

    // Check arena layouts
    for (let seed = 1; seed <= 50; seed++) {
      const layout = generateArenaLayout(seed, false);
      const structures = layout.structures;
      totalStructures += structures.length;

      // Check structures against each other
      for (let i = 0; i < structures.length; i++) {
        const s1 = structures[i]!;
        const f1s = structureFootprint(s1.assetId, s1.x, s1.z, s1.rotation, s1.radius, s1.height, s1.lengthScale);
        
        for (let j = i + 1; j < structures.length; j++) {
          const s2 = structures[j]!;

          // Ignore overlaps between connected palisade partners
          if (s1.assetId === 'prop.arena.palisade' && s2.assetId === 'prop.arena.palisade') {
            const r = s1.radius;
            const A1x = s1.x + Math.cos(s1.rotation) * r;
            const A1z = s1.z - Math.sin(s1.rotation) * r;
            const B1x = s1.x - Math.cos(s1.rotation) * r;
            const B1z = s1.z + Math.sin(s1.rotation) * r;

            const A2x = s2.x + Math.cos(s2.rotation) * r;
            const A2z = s2.z - Math.sin(s2.rotation) * r;
            const B2x = s2.x - Math.cos(s2.rotation) * r;
            const B2z = s2.z + Math.sin(s2.rotation) * r;

            const dAA = Math.hypot(A1x - A2x, A1z - A2z);
            const dAB = Math.hypot(A1x - B2x, A1z - B2z);
            const dBA = Math.hypot(B1x - A2x, B1z - A2z);
            const dBB = Math.hypot(B1x - B2x, B1z - B2z);

            if (dAA < 0.05 || dAB < 0.05 || dBA < 0.05 || dBB < 0.05) {
              continue;
            }
          }

          const f2s = structureFootprint(s2.assetId, s2.x, s2.z, s2.rotation, s2.radius, s2.height, s2.lengthScale);

          for (const c1 of f1s) {
            for (const c2 of f2s) {
              const dx = c1.x - c2.x;
              const dz = c1.z - c2.z;
              const minDist = c1.radius + c2.radius;
              if (dx * dx + dz * dz < minDist * minDist) {
                console.log(`Arena Overlap found in seed ${seed}:`);
                console.log(`  - Structure 1: ${s1.assetId} at (${s1.x}, ${s1.z})`);
                console.log(`  - Structure 2: ${s2.assetId} at (${s2.x}, ${s2.z})`);
                overlapCount++;
              }
            }
          }
        }

        // Check structures against barrels
        for (const b of layout.barrels) {
          for (const c1 of f1s) {
            const dx = c1.x - b.x;
            const dz = c1.z - b.z;
            const minDist = c1.radius + 0.6;
            if (dx * dx + dz * dz < minDist * minDist) {
              console.log(`Arena Overlap found in seed ${seed}:`);
              console.log(`  - Structure: ${s1.assetId} at (${s1.x}, ${s1.z})`);
              console.log(`  - Barrel at (${b.x}, ${b.z})`);
              overlapCount++;
            }
          }
        }

        // Check structures against drums
        for (const d of layout.drums) {
          for (const c1 of f1s) {
            const dx = c1.x - d.x;
            const dz = c1.z - d.z;
            const minDist = c1.radius + 0.6;
            if (dx * dx + dz * dz < minDist * minDist) {
              console.log(`Arena Overlap found in seed ${seed}:`);
              console.log(`  - Structure: ${s1.assetId} at (${s1.x}, ${s1.z})`);
              console.log(`  - Drum at (${d.x}, ${d.z})`);
              overlapCount++;
            }
          }
        }

        // Check structures against tireStacks
        for (const t of layout.tireStacks) {
          for (const c1 of f1s) {
            const dx = c1.x - t.x;
            const dz = c1.z - t.z;
            const minDist = c1.radius + 2.1;
            if (dx * dx + dz * dz < minDist * minDist) {
              console.log(`Arena Overlap found in seed ${seed}:`);
              console.log(`  - Structure: ${s1.assetId} at (${s1.x}, ${s1.z})`);
              console.log(`  - TireStack at (${t.x}, ${t.z})`);
              overlapCount++;
            }
          }
        }
      }
    }

    // Check section layouts
    const mockSection = {
      index: 0,
      name: "Mock Section 1",
      bounds: { minX: -25, maxX: 25, minZ: 25, maxZ: 65 },
      boxes: [{ minX: -25, maxX: 25, minZ: 25, maxZ: 65 }],
      portalPoints: [],
      templateId: "mock",
    };

    for (let seed = 1; seed <= 50; seed++) {
      const layout = generateSectionCover(seed, mockSection, null);
      const structures = layout.structures;
      totalStructures += structures.length;

      for (let i = 0; i < structures.length; i++) {
        const s1 = structures[i]!;
        const f1s = structureFootprint(s1.assetId, s1.x, s1.z, s1.rotation, s1.radius, s1.height, s1.lengthScale);

        for (let j = i + 1; j < structures.length; j++) {
          const s2 = structures[j]!;
          const f2s = structureFootprint(s2.assetId, s2.x, s2.z, s2.rotation, s2.radius, s2.height, s2.lengthScale);

          for (const c1 of f1s) {
            for (const c2 of f2s) {
              const dx = c1.x - c2.x;
              const dz = c1.z - c2.z;
              const minDist = c1.radius + c2.radius;
              if (dx * dx + dz * dz < minDist * minDist) {
                console.log(`Section Overlap found in seed ${seed}:`);
                console.log(`  - Structure 1: ${s1.assetId} at (${s1.x}, ${s1.z})`);
                console.log(`  - Structure 2: ${s2.assetId} at (${s2.x}, ${s2.z})`);
                overlapCount++;
              }
            }
          }
        }

        // Check structures against barrels
        for (const b of layout.barrels) {
          for (const c1 of f1s) {
            const dx = c1.x - b.x;
            const dz = c1.z - b.z;
            const minDist = c1.radius + 0.6;
            if (dx * dx + dz * dz < minDist * minDist) {
              console.log(`Section Overlap found in seed ${seed}:`);
              console.log(`  - Structure: ${s1.assetId} at (${s1.x}, ${s1.z})`);
              console.log(`  - Barrel at (${b.x}, ${b.z})`);
              overlapCount++;
            }
          }
        }

        // Check structures against drums
        for (const d of layout.drums) {
          for (const c1 of f1s) {
            const dx = c1.x - d.x;
            const dz = c1.z - d.z;
            const minDist = c1.radius + 0.6;
            if (dx * dx + dz * dz < minDist * minDist) {
              console.log(`Section Overlap found in seed ${seed}:`);
              console.log(`  - Structure: ${s1.assetId} at (${s1.x}, ${s1.z})`);
              console.log(`  - Drum at (${d.x}, ${d.z})`);
              overlapCount++;
            }
          }
        }

        // Check structures against tireStacks
        for (const t of layout.tireStacks) {
          for (const c1 of f1s) {
            const dx = c1.x - t.x;
            const dz = c1.z - t.z;
            const minDist = c1.radius + 2.1;
            if (dx * dx + dz * dz < minDist * minDist) {
              console.log(`Section Overlap found in seed ${seed}:`);
              console.log(`  - Structure: ${s1.assetId} at (${s1.x}, ${s1.z})`);
              console.log(`  - TireStack at (${t.x}, ${t.z})`);
              overlapCount++;
            }
          }
        }
      }
    }

    console.log(`Total structures checked: ${totalStructures}`);
    console.log(`Total overlaps found: ${overlapCount}`);
    expect(overlapCount).toBe(0);
  });
});
