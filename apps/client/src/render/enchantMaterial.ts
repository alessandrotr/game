import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial } from 'three';
import type { EnchantEffect } from '@arena/shared';

/**
 * Weapon "enchant" shaders — animated, class-themed glow on a weapon's showpiece
 * parts (blade / orb / mace-head). Built to be effectively free at any player
 * count, mirroring the brick/tile overlay pattern in {@link ./brickMaterial}:
 *
 *   • The effect is **injected into the part's own lit material** via
 *     `onBeforeCompile` — zero extra meshes, zero extra draw calls.
 *   • `customProgramCacheKey` is keyed by EFFECT only, so every player using e.g.
 *     `ember` (any color) shares ONE compiled program.
 *   • Animation is driven by a SINGLE shared time uniform ({@link enchantTime}),
 *     advanced once per frame by {@link EnchantClock}. Cost is O(1) per frame
 *     regardless of how many enchanted weapons are on screen.
 *   • "Glow without bloom": there is no post-processing pipeline, so the look is
 *     faked with animated emissive + a fresnel rim term (a few ALU ops on tiny
 *     weapon meshes). Fully opaque — no transparency sort / overdraw cost.
 *
 * Materials are cached per `effect|color|color2`, so identical enchants reuse one
 * material instance (few materials, one program per effect).
 */

/** The resolved enchant to apply to a weapon's showpiece parts. */
export interface EnchantParams {
  effect: EnchantEffect;
  color: string;
  color2?: string;
}

/** The one time uniform every enchant material shares. Written each frame by
 *  {@link EnchantClock}; assigning the absolute elapsed time (not accumulating)
 *  keeps it stable even if more than one canvas mounts a clock. */
export const enchantTime: { value: number } = { value: 0 };

/** Drop one of these inside any R3F canvas that renders enchanted weapons (the
 *  game scene and the customize preview). It advances the shared clock; with no
 *  enchanted weapon on screen it still costs nothing meaningful. */
export function EnchantClock(): null {
  useFrame((state) => {
    enchantTime.value = state.clock.elapsedTime;
  });
  return null;
}

const FRAG_COMMON = /* glsl */ `
uniform float uEnchantTime;
uniform vec3 uEnchColor;
uniform vec3 uEnchColor2;
varying vec3 vEnchWPos;
float enchHash(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898,78.233,37.719)))*43758.5453); }
`;

/**
 * Per-effect emissive contribution. Runs in a scope where these are in scope:
 *   float t        — shared time
 *   vec3  c1, c2   — primary / secondary enchant color
 *   float fres     — fresnel rim term (1 at grazing angles)
 *   vec3  vEnchWPos — world position (spatial variation)
 * It must assign `enchE` (the vec3 added to totalEmissiveRadiance).
 */
function effectGlsl(effect: EnchantEffect): string {
  switch (effect) {
    case 'ember':
      return /* glsl */ `
        float h = enchHash(vEnchWPos * 7.0);
        float f = sin(vEnchWPos.y * 9.0 - t * 6.0 + h * 6.28) * 0.5 + 0.5;
        float flick = 0.65 + 0.35 * sin(t * 22.0 + h * 10.0);
        enchE = mix(c2, c1, f) * (0.45 + f * 1.30 * flick) + fres * c1 * 1.6;
      `;
    case 'frost':
      return /* glsl */ `
        float s = 0.5 + 0.5 * sin(vEnchWPos.y * 6.0 + t * 1.6 + enchHash(vEnchWPos * 9.0) * 6.28);
        enchE = c1 * (0.18 + 0.22 * s) + fres * mix(c1, c2, 0.6) * 2.1;
      `;
    case 'arcane':
      return /* glsl */ `
        float ang = atan(vEnchWPos.x, vEnchWPos.z);
        float band = sin(ang * 4.0 + vEnchWPos.y * 6.0 - t * 3.0) * 0.5 + 0.5;
        enchE = mix(c1, c2, band) * (0.30 + band * 1.05) + fres * c1 * 1.5;
      `;
    case 'venom':
      return /* glsl */ `
        float h = enchHash(vEnchWPos * 6.0);
        float drip = fract(vEnchWPos.y * 3.0 - t * 0.8 + h);
        float blob = smoothstep(0.65, 1.0, drip);
        enchE = c1 * (0.22 + blob * 1.25) + fres * mix(c1, c2, 0.4) * 1.4;
      `;
    case 'holy':
      return /* glsl */ `
        float p = 0.7 + 0.3 * sin(t * 2.2);
        enchE = c1 * (0.45 * p) + fres * c2 * 2.3 * p;
      `;
    case 'storm':
      return /* glsl */ `
        float seg = floor(vEnchWPos.y * 22.0);
        float arc = step(0.86, enchHash(vec3(seg, floor(t * 13.0), seg)));
        float buzz = 0.4 + 0.6 * sin(t * 40.0 + seg);
        enchE = mix(c1, c2, arc) * (0.28 + arc * 2.2 * buzz) + fres * c1 * 1.8;
      `;
    case 'void':
    default:
      return /* glsl */ `
        float p = 0.6 + 0.4 * sin(t * 3.0);
        float edge = fres * fres;
        enchE = mix(c2, c1, edge) * edge * (1.6 + p);
        // Drink the light at the core for the signature dark-hole read.
        diffuseColor.rgb *= mix(0.25, 1.0, fres);
      `;
  }
}

function fragInjection(effect: EnchantEffect): string {
  return /* glsl */ `
#include <emissivemap_fragment>
{
  float t = uEnchantTime;
  vec3 c1 = uEnchColor;
  vec3 c2 = uEnchColor2;
  float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
  vec3 enchE = vec3(0.0);
  ${effectGlsl(effect)}
  totalEmissiveRadiance += enchE;
}
`;
}

const cache = new Map<string, MeshStandardMaterial>();

/** A cached, animated enchant material for a part. One instance per
 *  `effect|color|color2`; all of them share a single compiled program per effect
 *  and the single global {@link enchantTime} uniform. */
export function enchantMaterialFor(
  effect: EnchantEffect,
  color: string,
  color2?: string,
): MeshStandardMaterial {
  const key = `${effect}|${color}|${color2 ?? ''}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const c1 = new Color(color);
  const c2 = new Color(color2 ?? color);

  // A dark, slightly metallic base; the injected emissive + fresnel rim carry the
  // actual color. Smooth-shaded (not flat) so the fresnel reads cleanly.
  const mat = new MeshStandardMaterial({ color: '#34373d', metalness: 0.55, roughness: 0.38 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEnchantTime = enchantTime;
    shader.uniforms.uEnchColor = { value: c1 };
    shader.uniforms.uEnchColor2 = { value: c2 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEnchWPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vEnchWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON}`)
      .replace('#include <emissivemap_fragment>', fragInjection(effect));
  };
  // Every color of the same effect reuses one program (color lives in a uniform).
  mat.customProgramCacheKey = () => `enchant-${effect}`;

  cache.set(key, mat);
  return mat;
}
