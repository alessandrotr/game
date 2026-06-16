import type * as THREE from 'three';

/**
 * A procedural brick/masonry overlay for the standard lit material, applied via
 * `onBeforeCompile`. It darkens mortar grooves and gives each brick a faint tint
 * variation, leaving all the real PBR lighting/shadows intact — so brick walls
 * sit naturally next to the rest of the town. No textures and no extra geometry.
 *
 * The pattern is keyed off WORLD position: courses run along world-Y and the
 * horizontal coordinate uses whichever of world-X/Z is more in-plane (the axis
 * the face least points along). So bricks stay level and line up seamlessly
 * across a wall split into many box segments (e.g. the holed front wall around
 * windows), tile cleanly on yaw-rotated walls, and wrap around cylinder towers.
 */

type Shader = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

const VARYINGS = /* glsl */ `
varying vec3 vBrickWPos;
varying vec3 vBrickWNormal;
`;

const FRAG_HELPERS = /* glsl */ `
// Returns mortar amount (1 = in a groove) for brick-unit uv; the out value is a
// per-brick number in [-0.5, 0.5] for subtle face-to-face colour change.
float brickPattern(vec2 uv, out float variation) {
  float row = floor(uv.y);
  vec2 p = vec2(uv.x + mod(row, 2.0) * 0.5, uv.y); // half-brick offset each row
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float mw = 0.05;  // mortar width (along the brick)
  float mh = 0.09;  // mortar height (between courses)
  float mortar = max(
    max(smoothstep(mw, 0.0, f.x), smoothstep(1.0 - mw, 1.0, f.x)),
    max(smoothstep(mh, 0.0, f.y), smoothstep(1.0 - mh, 1.0, f.y))
  );
  variation = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  return mortar;
}
`;

const BRICK_W = 0.5; // brick length, world units
const BRICK_H = 0.22; // course height, world units

export function brickOnBeforeCompile(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}`)
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vBrickWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vBrickWNormal = normalize(mat3(modelMatrix) * normal);`,
    );

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}\n${FRAG_HELPERS}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       {
         vec3 wn = abs(vBrickWNormal);
         float sx = 1.0 / ${BRICK_W.toFixed(3)};
         float sy = 1.0 / ${BRICK_H.toFixed(3)};
         // Courses along world-Y; run bricks along whichever horizontal axis the
         // face faces least (dominant-axis projection — clean on angled walls and
         // wraps around towers, no cross-hatch from blending).
         float horiz = (wn.x > wn.z ? vBrickWPos.z : vBrickWPos.x) * sx;
         float variation;
         float mortar = brickPattern(vec2(horiz, vBrickWPos.y * sy), variation);
         diffuseColor.rgb *= 1.0 + variation * 0.10;            // per-brick tint
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.6, mortar); // mortar grooves
       }`,
    );
}

/** Shared program cache key so every brick wall reuses one compiled shader. */
export const brickCacheKey = (): string => 'placeholder-brick';
