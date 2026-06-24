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
// Smooth 3D value noise + fbm — gives the effects real flowing detail instead of
// flat bands. Three octaves: enough to read as energy, cheap on tiny showpieces.
float enchNoise(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=enchHash(i),               b=enchHash(i+vec3(1.0,0.0,0.0));
  float c=enchHash(i+vec3(0.0,1.0,0.0)), d=enchHash(i+vec3(1.0,1.0,0.0));
  float e=enchHash(i+vec3(0.0,0.0,1.0)), g=enchHash(i+vec3(1.0,0.0,1.0));
  float h=enchHash(i+vec3(0.0,1.0,1.0)), k=enchHash(i+vec3(1.0,1.0,1.0));
  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(h,k,f.x),f.y), f.z);
}
float enchFbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v+=a*enchNoise(p); p*=2.03; a*=0.5; } return v; }
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
      // Living fire: turbulent flames licking upward, a deep→white-hot ramp, and
      // sparks popping over the surface.
      return /* glsl */ `
        float flow  = enchFbm(vEnchWPos * 6.0 + vec3(0.0, -t * 1.7, 0.0));
        float lick  = enchFbm(vEnchWPos * 11.0 + vec3(0.0, -t * 3.4, t * 0.6));
        float heat  = flow * 0.6 + lick * 0.4;
        float spark = step(0.92, enchHash(vEnchWPos * 30.0 + floor(t * 20.0)));
        float flick = 0.7 + 0.3 * sin(t * 26.0 + heat * 12.0);
        vec3 fire = mix(c2, c1, smoothstep(0.15, 0.8, heat));
        fire = mix(fire, vec3(1.0, 0.95, 0.8), smoothstep(0.75, 1.0, heat) * 0.7); // white-hot tips
        enchE = fire * (0.30 + heat * 1.9 * flick) + spark * c1 * 2.5 + fres * c1 * 1.7;
      `;
    case 'frost':
      // Frozen crystal: a slow drifting shimmer with sharp crystalline glints and
      // a cold, bright rime on the edges.
      return /* glsl */ `
        float drift  = enchFbm(vEnchWPos * 7.0 + t * 0.25);
        float facet  = pow(abs(sin(vEnchWPos.x * 20.0) * sin(vEnchWPos.y * 20.0) * sin(vEnchWPos.z * 20.0)), 0.5);
        float glint  = step(0.85, facet) * (0.5 + 0.5 * sin(t * 9.0 + drift * 20.0));
        float ice    = drift * 0.45 + facet * 0.35;
        enchE = mix(c1, c2, ice) * (0.16 + ice * 0.6) + glint * vec3(0.9, 0.98, 1.0) * 1.6
              + fres * mix(c1, c2, 0.7) * 2.2;
      `;
    case 'arcane':
      // Iridescent runic energy: swirling glyph bands whose hue never settles,
      // shifting between the two colors with the flow, time and viewing angle.
      return /* glsl */ `
        float swirl = enchFbm(vEnchWPos * 7.0 + vec3(0.0, t * 0.5, 0.0));
        float ang   = atan(vEnchWPos.x, vEnchWPos.z);
        float rune  = sin(ang * 5.0 + vEnchWPos.y * 7.0 - t * 3.0 + swirl * 6.2831) * 0.5 + 0.5;
        float hue   = 0.5 + 0.5 * sin(swirl * 6.2831 + t * 1.6 + fres * 3.0);
        vec3  col   = mix(c1, c2, hue);
        enchE = col * (0.28 + rune * 1.3) + fres * mix(c2, vec3(1.0), 0.4) * 2.1;
      `;
    case 'venom':
      // Bubbling toxin: oily blobs welling up and dripping, with a sickly rim.
      return /* glsl */ `
        float brew = enchFbm(vEnchWPos * 9.0 + vec3(0.0, -t * 0.8, 0.0));
        float blob = smoothstep(0.5, 0.82, brew);
        float drip = fract(vEnchWPos.y * 3.0 - t * 0.9 + brew * 1.5);
        float bead = smoothstep(0.7, 1.0, drip) * smoothstep(0.45, 0.6, brew);
        enchE = mix(c2, c1, blob) * (0.22 + blob * 1.5) + bead * c1 * 1.6 + fres * mix(c1, c2, 0.4) * 1.5;
      `;
    case 'holy':
      // Radiant blessing: a soft breathing glow, slow rotating light rays, and a
      // bright haloed rim.
      return /* glsl */ `
        float ray   = pow(max(0.0, sin(atan(vEnchWPos.x, vEnchWPos.z) * 6.0 + t * 0.7)), 5.0);
        float motes = enchFbm(vEnchWPos * 9.0 + vec3(0.0, -t * 0.6, 0.0));
        float pulse = 0.7 + 0.3 * sin(t * 2.3);
        enchE = mix(c1, vec3(1.0, 0.98, 0.9), 0.3) * (0.4 + ray * 0.7 + motes * 0.3) * pulse
              + fres * c2 * 2.6 * pulse;
      `;
    case 'storm':
      // Crackling lightning: jagged arcs snapping across the surface with a fast
      // electric buzz and a charged rim.
      return /* glsl */ `
        float seg  = floor(vEnchWPos.y * 16.0 + vEnchWPos.x * 5.0);
        float arc  = step(0.80, enchHash(vec3(seg, floor(t * 17.0), seg * 1.7)));
        float fork = step(0.86, enchFbm(vEnchWPos * 16.0 + t * 6.0));
        float buzz = 0.4 + 0.6 * sin(t * 50.0 + seg);
        float bolt = arc * buzz + fork * 0.7;
        enchE = mix(c1, c2, arc) * (0.24 + bolt * 2.6) + fres * mix(c2, vec3(0.85, 0.92, 1.0), 0.5) * 1.9;
      `;
    case 'astral':
      // A near-BLACK orb of deep space. No glow, no rim — the ONLY bright thing is
      // a field of twinkling stars. Structurally the opposite of arcane's bright
      // continuous swirl, so the two can never be confused.
      return /* glsl */ `
        // Two star layers on fine grids: sparse, bright, blinking at different rates.
        vec3 g1 = floor(vEnchWPos * 62.0); float a1 = enchHash(g1);
        float s1 = step(0.90, a1) * pow(0.5 + 0.5 * sin(t * 6.0 + a1 * 60.0), 4.0);
        vec3 g2 = floor(vEnchWPos * 34.0); float a2 = enchHash(g2 + 19.0);
        float s2 = step(0.92, a2) * pow(0.5 + 0.5 * sin(t * 3.0 + a2 * 40.0), 3.0);
        // A whisper of dim nebula so the black isn't dead flat (very low).
        float haze = enchFbm(vEnchWPos * 5.0 + vec3(0.0, t * 0.12, 0.0));
        vec3 neb = mix(c1, c2, haze) * haze * 0.22;
        // Stars are near-white with a faint warm tint; no fresnel rim at all.
        enchE = neb + (s1 * 3.0 + s2 * 5.5) * mix(vec3(1.0), c1, 0.25);
        // Crush the lit base to near-black so it reads as the void of space.
        diffuseColor.rgb *= 0.08;
      `;
    case 'verdant':
      // Living emerald: branching ridged veins of energy crawling over the
      // showpiece, shimmering between emerald and lime-gold — a distinct vein
      // structure, nothing like a swirl, flame, or radiance.
      return /* glsl */ `
        float n = enchFbm(vEnchWPos * 7.0 + vec3(0.0, -t * 0.7, t * 0.3));
        float veins = pow(1.0 - abs(n - 0.5) * 2.0, 3.0);   // bright along ridge lines
        float pulse = 0.7 + 0.3 * sin(t * 3.5 + n * 6.2831);
        vec3 col = mix(c1, c2, veins);
        enchE = col * (0.30 + veins * 2.0) * pulse + fres * mix(c1, vec3(0.85, 1.0, 0.85), 0.5) * 1.9;
      `;
    case 'void':
    default:
      // Dark singularity: a churning core that drinks the light, ringed by an
      // unstable, hue-shifting event horizon.
      return /* glsl */ `
        float churn = enchFbm(vEnchWPos * 8.0 + vec3(t * 0.4, -t * 0.3, t * 0.2));
        float edge  = fres * fres;
        float hue   = 0.5 + 0.5 * sin(churn * 6.2831 + t * 1.3);
        vec3  rim   = mix(c1, c2, hue);
        enchE = rim * edge * (1.9 + churn * 1.4) + rim * pow(edge, 0.5) * 0.35;
        // Drink the light at the core for the signature dark-hole read.
        diffuseColor.rgb *= mix(0.1, 1.0, edge);
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
  let c2: Color;
  if (color2) {
    c2 = new Color(color2);
  } else {
    // No secondary color given — derive an iridescent partner (hue-rotated and
    // lifted) so the two-tone effects shimmer instead of reading as one flat hue.
    const hsl = { h: 0, s: 0, l: 0 };
    c2 = new Color(color);
    c2.getHSL(hsl);
    c2.setHSL((hsl.h + 0.08) % 1.0, Math.min(1, hsl.s + 0.06), Math.min(1, hsl.l + 0.16));
  }

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
