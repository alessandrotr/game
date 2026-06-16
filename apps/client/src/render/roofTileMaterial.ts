import type * as THREE from 'three';

/**
 * A procedural roof-tile overlay for the standard lit material, applied via
 * `onBeforeCompile` — the roof counterpart to the brick wall pattern. It lays
 * down horizontal courses of tiles (half-offset each row) with a dark shadow
 * line where the next course overlaps, vertical seams between tiles, a lit-lip→
 * shaded-top gradient per tile, and a faint per-tile tint. All real PBR lighting
 * is preserved; no textures, no extra geometry.
 *
 * Like the brick pattern it keys off WORLD position: courses run along world-Y
 * (so they stay level rings around a cone) and tiles run along whichever of
 * world-X/Z is more in-plane, so they tile cleanly across faceted pyramid/cone
 * roofs at any yaw.
 */

type Shader = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

const VARYINGS = /* glsl */ `
varying vec3 vTileWPos;
varying vec3 vTileWNormal;
`;

const FRAG_HELPERS = /* glsl */ `
// Returns groove amount (1 = seam or overlap shadow) for tile-unit uv; out params
// give a per-tile shading gradient and a per-tile tint in [-0.5, 0.5].
float tilePattern(vec2 uv, out float shade, out float variation) {
  float row = floor(uv.y);
  float fy = fract(uv.y);
  float colx = uv.x + mod(row, 2.0) * 0.5; // half-tile offset each course
  float fx = fract(colx);
  vec2 cell = vec2(floor(colx), row);
  float seam = smoothstep(0.07, 0.0, min(fx, 1.0 - fx)); // vertical gaps
  float lap = smoothstep(0.80, 1.0, fy);                 // overlap shadow at course top
  shade = mix(1.06, 0.88, smoothstep(0.0, 0.85, fy));    // lit lip -> shaded top
  variation = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  return max(seam, lap);
}
`;

const TILE_W = 0.4; // tile width, world units
const TILE_H = 0.18; // course height, world units

export function roofTileOnBeforeCompile(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}`)
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vTileWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vTileWNormal = normalize(mat3(modelMatrix) * normal);`,
    );

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}\n${FRAG_HELPERS}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       {
         vec3 wn = abs(vTileWNormal);
         float sx = 1.0 / ${TILE_W.toFixed(3)};
         float sy = 1.0 / ${TILE_H.toFixed(3)};
         float horiz = (wn.x > wn.z ? vTileWPos.z : vTileWPos.x) * sx;
         float shade, variation;
         float groove = tilePattern(vec2(horiz, vTileWPos.y * sy), shade, variation);
         diffuseColor.rgb *= shade;                          // per-tile overlap gradient
         diffuseColor.rgb *= 1.0 + variation * 0.07;         // per-tile tint
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5, groove); // seams + lap shadow
       }`,
    );
}

/** Shared program cache key so every tiled roof reuses one compiled shader. */
export const roofTileCacheKey = (): string => 'placeholder-roof-tile';
