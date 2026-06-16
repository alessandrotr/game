import { useEffect, useMemo } from 'react';
import { Color, MeshStandardMaterial, type Matrix4 } from 'three';
import { ARENA_HALF_SIZE, type PlaceholderPart, type Vec3 } from '@arena/shared';
import { mergePlaced, trsMatrix } from '../render/mergeGeometry';
import { MergedGroupMesh } from '../render/MergedGroupMesh';

const SIZE = ARENA_HALF_SIZE * 2;
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.5;

// Gritty junkyard palette (matches the trailer-park props in assets/data/props).
const DIRT = '#5b4f3c';
const DIRT_DARK = '#3f3729';
const OIL = '#221d18';
const SCRAP = '#6f675b';
const SCRAP_DARK = '#474037';
const RUST = '#7c4a2f';
const POST = '#3a342c';

const STAIN_GLSL = /* glsl */ `
  // Soft-edged coverage of a circle (centre c, radius r): 1 inside → 0 outside.
  float gCircle(vec2 p, vec2 c, float r){
    return 1.0 - smoothstep(r - 0.5, r + 0.5, distance(p, c));
  }
`;

/**
 * The packed-dirt arena floor with its worn patches and oil spills painted
 * straight into the shader — one opaque surface, so (unlike separate decal
 * meshes) there's nothing coplanar to z-fight, nothing sitting above y=0 to clip
 * the player's feet, and no overdraw. Each stain blends its colour over the dirt
 * (and compounds where they overlap), matching the old translucent discs.
 */
function DirtGround() {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: new Color(DIRT), roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDirtDark = { value: new Color(DIRT_DARK) };
      shader.uniforms.uOil = { value: new Color(OIL) };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vWorld;\nuniform vec3 uDirtDark;\nuniform vec3 uOil;\n${STAIN_GLSL}`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
            {
              vec2 gp = vWorld.xz;
              vec3 col = diffuseColor.rgb;
              // Worn, muddier patches.
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(9.0, 4.0), 5.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(-9.0, -4.0), 5.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(-4.0, 9.0), 4.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(4.0, -9.0), 4.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(0.0, 0.0), 6.0));
              // Oil spills.
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(10.0, 5.0), 2.2));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(-10.0, -5.0), 2.2));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(-5.0, -9.0), 1.8));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(5.0, 9.0), 1.8));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(8.0, 2.0), 1.4));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(-8.0, -2.0), 1.4));
              diffuseColor.rgb = col;
            }`,
        );
    };
    m.customProgramCacheKey = () => 'arena-dirt-v1';
    return m;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  );
}

const fp = (args: Vec3, color: string, extra: Partial<PlaceholderPart> = {}): PlaceholderPart => ({
  shape: 'box',
  args,
  color,
  roughness: 0.9,
  ...extra,
});

/** All four perimeter hoardings as transformed parts — a corrugated panel, dark
 *  base strip, top rail, rust patches and leaning posts per side — ready to be
 *  merged. `horizontal` runs a wall along X (±Z walls); otherwise along Z. */
function fenceParts(): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const offset = ARENA_HALF_SIZE + WALL_THICKNESS / 2;
  const walls = [
    { x: 0, z: offset, length: SIZE + WALL_THICKNESS * 2, horizontal: true },
    { x: 0, z: -offset, length: SIZE + WALL_THICKNESS * 2, horizontal: true },
    { x: offset, z: 0, length: SIZE, horizontal: false },
    { x: -offset, z: 0, length: SIZE, horizontal: false },
  ];
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  for (const w of walls) {
    const yaw = w.horizontal ? 0 : Math.PI / 2;
    const wm = trsMatrix([w.x, 0, w.z], [0, yaw, 0]);
    const at = (pos: Vec3, rot?: Vec3) => wm.clone().multiply(trsMatrix(pos, rot));
    const L = w.length;
    // Corrugated panel run.
    out.push({
      part: fp([L, WALL_HEIGHT, WALL_THICKNESS], SCRAP, { roughness: 0.95, metalness: 0.15 }),
      matrix: at([0, WALL_HEIGHT / 2, 0]),
    });
    // Dark base strip (mud line).
    out.push({
      part: fp([L, 0.6, 0.04], SCRAP_DARK, { roughness: 1, castShadow: false }),
      matrix: at([0, 0.3, WALL_THICKNESS / 2 + 0.01]),
    });
    // Top rail.
    out.push({
      part: fp([L, 0.16, WALL_THICKNESS + 0.12], SCRAP_DARK, {
        roughness: 0.9,
        metalness: 0.2,
        receiveShadow: false,
      }),
      matrix: at([0, WALL_HEIGHT + 0.08, 0]),
    });
    // Rust patches.
    const patchCount = Math.round(L / 7);
    for (let i = 0; i < patchCount; i++) {
      const u = -L / 2 + L * ((i + 0.5) / patchCount);
      out.push({
        part: fp([1.6 + (i % 3) * 0.7, 0.7 + (i % 2) * 0.5, 0.04], RUST, {
          roughness: 1,
          castShadow: false,
        }),
        matrix: at([u, 0.7 + (i % 2) * 0.7, WALL_THICKNESS / 2 + 0.02]),
      });
    }
    // Leaning support posts.
    const postCount = Math.round(L / 5);
    for (let i = 0; i <= postCount; i++) {
      const u = -L / 2 + (i * L) / postCount;
      out.push({
        part: fp([0.18, WALL_HEIGHT + 0.5, 0.18], POST, {
          roughness: 0.9,
          metalness: 0.2,
          receiveShadow: false,
        }),
        matrix: at([u, WALL_HEIGHT / 2, WALL_THICKNESS / 2 + 0.12], [i % 2 === 0 ? 0.04 : -0.03, 0, 0]),
      });
    }
  }
  return out;
}

/** Static arena geometry: a packed-dirt floor with oil stains and four rusted
 *  corrugated-metal hoardings around the perimeter — a fenced-in junkyard lot.
 *  The hoardings are merged into a few meshes (was ~60 separate draw calls).
 *  Cover (trailers, cars, dumpsters, scrap) is placed as map props, not here. */
export function Arena() {
  const fence = useMemo(() => mergePlaced(fenceParts()), []);
  useEffect(() => () => fence.forEach((g) => g.geometry.dispose()), [fence]);

  return (
    <group>
      {/* Packed-dirt floor with its worn patches + oil spills painted into the
          shader (one opaque surface — no decal meshes to z-fight or clip feet). */}
      <DirtGround />
      {/* Perimeter hoardings (merged). */}
      {fence.map((g) => (
        <MergedGroupMesh key={g.key} group={g} />
      ))}
    </group>
  );
}
