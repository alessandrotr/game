import { useMemo } from 'react';
import { Color, MeshStandardMaterial } from 'three';
import { ARENA_HALF_SIZE } from '@arena/shared';

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

/** One side of the perimeter: a corrugated-metal hoarding — rusted panels, a
 *  dark base strip, a top rail, and leaning posts. `horizontal` runs it along X
 *  (the ±Z walls); otherwise along Z (the ±X walls). */
function FenceWall({ x, z, length, horizontal }: { x: number; z: number; length: number; horizontal: boolean }) {
  const yaw = horizontal ? 0 : Math.PI / 2;
  const postCount = Math.round(length / 5);
  const posts = Array.from({ length: postCount + 1 }, (_, i) => -length / 2 + (i * length) / postCount);
  // A few rust patches scattered along the run for weathering.
  const patches = Array.from({ length: Math.round(length / 7) }, (_, i) => ({
    u: -length / 2 + length * ((i + 0.5) / Math.round(length / 7)),
    w: 1.6 + (i % 3) * 0.7,
    h: 0.7 + (i % 2) * 0.5,
    y: 0.7 + (i % 2) * 0.7,
  }));

  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* Corrugated panel run. */}
      <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={SCRAP} roughness={0.95} metalness={0.15} />
      </mesh>
      {/* Dark base strip (mud line). */}
      <mesh position={[0, 0.3, WALL_THICKNESS / 2 + 0.01]}>
        <boxGeometry args={[length, 0.6, 0.04]} />
        <meshStandardMaterial color={SCRAP_DARK} roughness={1} />
      </mesh>
      {/* Top rail. */}
      <mesh position={[0, WALL_HEIGHT + 0.08, 0]} castShadow>
        <boxGeometry args={[length, 0.16, WALL_THICKNESS + 0.12]} />
        <meshStandardMaterial color={SCRAP_DARK} roughness={0.9} metalness={0.2} />
      </mesh>
      {/* Rust patches. */}
      {patches.map((p, i) => (
        <mesh key={`r${i}`} position={[p.u, p.y, WALL_THICKNESS / 2 + 0.02]}>
          <boxGeometry args={[p.w, p.h, 0.04]} />
          <meshStandardMaterial color={RUST} roughness={1} />
        </mesh>
      ))}
      {/* Leaning support posts. */}
      {posts.map((u, i) => (
        <mesh
          key={`p${i}`}
          position={[u, WALL_HEIGHT / 2, WALL_THICKNESS / 2 + 0.12]}
          rotation={[i % 2 === 0 ? 0.04 : -0.03, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.18, WALL_HEIGHT + 0.5, 0.18]} />
          <meshStandardMaterial color={POST} roughness={0.9} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** Static arena geometry: a packed-dirt floor with oil stains and four rusted
 *  corrugated-metal hoardings around the perimeter — a fenced-in junkyard lot.
 *  Cover (trailers, cars, dumpsters, scrap) is placed as map props, not here. */
export function Arena() {
  const offset = ARENA_HALF_SIZE + WALL_THICKNESS / 2;

  return (
    <group>
      {/* Packed-dirt floor with its worn patches + oil spills painted into the
          shader (one opaque surface — no decal meshes to z-fight or clip feet). */}
      <DirtGround />

      {/* Perimeter hoardings. */}
      <FenceWall x={0} z={offset} length={SIZE + WALL_THICKNESS * 2} horizontal />
      <FenceWall x={0} z={-offset} length={SIZE + WALL_THICKNESS * 2} horizontal />
      <FenceWall x={offset} z={0} length={SIZE} horizontal={false} />
      <FenceWall x={-offset} z={0} length={SIZE} horizontal={false} />
    </group>
  );
}
