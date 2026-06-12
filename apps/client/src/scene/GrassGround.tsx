import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshStandardMaterial, type IUniform } from 'three';
import { useEnvStore } from '../tuning/useEnvStore';

/**
 * The town ground: a flat `MeshStandardMaterial` plane (full PBR lighting +
 * receives the sun's shadows) with a STATIC procedural colour variation so it
 * isn't a flat slab between/around the grass blades. No animation, no normal
 * tricks — the tall blades (`GrassBlades`) provide the motion and relief; an
 * animated flat ground under them just read as weird.
 *
 * Colours come from the Env panel (Grass dark / light) and update live.
 */

const GRASS = '#4a6b3a';

const NOISE_GLSL = /* glsl */ `
  float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),
               mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Fractal noise — layered octaves give organic detail instead of one blobby scale.
  float gFbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * gNoise(p); p = p * 2.02 + 7.3; a *= 0.5; }
    return v;
  }
`;

const ALBEDO_GLSL = /* glsl */ `
  {
    vec2 gp = vGrassWorld.xz;

    // A calm lawn: gentle large-scale tone + a little finer detail, blended into a
    // NARROW band around the mid green so it never reads as busy or high-contrast.
    float macro = gFbm(gp * 0.06);
    float detail = gFbm(gp * 0.7);
    float t = 0.4 + clamp(macro * 0.6 + detail * 0.4, 0.0, 1.0) * 0.35; // ~0.4..0.75
    vec3 grass = mix(uGrassDark, uGrassLight, t);

    // Whisper of fine speckle, just enough to avoid a dead-flat slab.
    grass *= 0.98 + 0.02 * gNoise(gp * 9.0);
    diffuseColor.rgb = grass;
  }
`;

export function GrassGround() {
  const uniforms = useRef<Record<string, IUniform> | null>(null);

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: new Color(GRASS), roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      const town = useEnvStore.getState().town;
      shader.uniforms.uGrassDark = { value: new Color(town.grassDark) };
      shader.uniforms.uGrassLight = { value: new Color(town.grassLight) };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassWorld;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvGrassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vGrassWorld;\nuniform vec3 uGrassDark;\nuniform vec3 uGrassLight;\n${NOISE_GLSL}`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );\n${ALBEDO_GLSL}`,
        );

      uniforms.current = shader.uniforms;
    };
    m.customProgramCacheKey = () => 'grass-ground-v3';
    return m;
  }, []);

  // Keep the ground colours in sync with the Env panel (no per-frame work).
  useEffect(
    () =>
      useEnvStore.subscribe((s) => {
        const u = uniforms.current;
        if (!u) return;
        (u.uGrassDark!.value as Color).set(s.town.grassDark);
        (u.uGrassLight!.value as Color).set(s.town.grassLight);
      }),
    [],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[600, 600]} />
    </mesh>
  );
}
