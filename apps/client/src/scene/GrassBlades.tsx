import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector2,
  type InstancedMesh,
  type IUniform,
} from 'three';
import { TOWN_OBSTACLES } from '@arena/shared';
import { getLocalRenderTransform } from '../store/localPlayer';
import { useEnvStore } from '../tuning/useEnvStore';

/**
 * Real tall grass: thousands of blade quads drawn as a single instanced mesh, so
 * you get actual 3D silhouettes (the thing a flat shaded plane can't fake) at a
 * modest cost — one draw call, vertex-shader wind, no shadow pass.
 *
 * It's a `MeshStandardMaterial` so the blades light with the dusk sun / IBL like
 * everything else; `onBeforeCompile` adds the wind sway (top bends most, phase
 * varies by world position) and a base→tip colour gradient. Town-only.
 *
 * A fixed patch around the active town centre (spawn / plaza / market). It can be
 * made player-following later to cover the whole map; this keeps it simple.
 */

const COUNT = 14000;
const RADIUS = 26;
const BLADE_H = 0.32;
/** Margin (world units) kept clear around every non-grass surface. */
const MARGIN = 0.4;
/** Paved plaza (kept clear). */
const PLAZA = { x: 0, z: -2, r: 8.8 };
/** Street strips — must mirror the decals in TownGround.tsx (axis-aligned). */
const STREETS: { cx: number; cz: number; hx: number; hz: number }[] = [
  { cx: 0, cz: -4, hx: 2.5, hz: 22 },
  { cx: 8, cz: 5, hx: 9, hz: 2 },
  { cx: -8, cz: 2, hx: 9, hz: 2 },
];

// --- Low-frequency value noise (JS), for natural clumping of density + height ---
const nHash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const nNoise = (x: number, z: number): number => {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = nHash(xi, zi);
  const b = nHash(xi + 1, zi);
  const c = nHash(xi, zi + 1);
  const d = nHash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
/** 0..1 lushness: big patches (≈16-unit) modulated by a medium octave. */
const lushness = (x: number, z: number): number =>
  nNoise(x * 0.06, z * 0.06) * 0.65 + nNoise(x * 0.15, z * 0.15) * 0.35;

/** True only where grass belongs: not on the plaza, streets, or any prop/building
 *  footprint (the obstacle circles already cover houses, stalls, the fountain, …). */
function onGrass(x: number, z: number): boolean {
  const pdx = x - PLAZA.x;
  const pdz = z - PLAZA.z;
  if (pdx * pdx + pdz * pdz < PLAZA.r * PLAZA.r) return false;
  for (const s of STREETS) {
    if (Math.abs(x - s.cx) < s.hx + MARGIN && Math.abs(z - s.cz) < s.hz + MARGIN) return false;
  }
  for (const o of TOWN_OBSTACLES) {
    const dx = x - o.x;
    const dz = z - o.z;
    const r = o.radius + MARGIN;
    if (dx * dx + dz * dz < r * r) return false;
  }
  return true;
}

export function GrassBlades() {
  const meshRef = useRef<InstancedMesh>(null);
  const uniforms = useRef<Record<string, IUniform> | null>(null);
  const last = useRef(new Vector2());

  const geometry = useMemo(() => {
    // A thin vertical blade with a few height segments (so it can bend), pivot
    // moved to the base so it sways from the ground up.
    const g = new PlaneGeometry(0.09, BLADE_H, 1, 4);
    g.translate(0, BLADE_H / 2, 0);
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 1, metalness: 0, side: DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWind = { value: 1 };
      shader.uniforms.uBase = { value: new Color('#3e5a30') };
      shader.uniforms.uTip = { value: new Color('#84a85e') };
      shader.uniforms.uPlayer = { value: new Vector2(9999, 9999) };
      shader.uniforms.uPlayerMove = { value: 0 };
      shader.uniforms.uStomp = { value: 0.6 }; // how far the top bends away
      shader.uniforms.uStompRadius = { value: 1.9 };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform vec2 uPlayer;\nuniform float uPlayerMove;\nuniform float uStomp;\nuniform float uStompRadius;\nvarying float vBladeH;\nvarying float vTint;',
        )
        // Round the blade's normal across its width (Roystan trick): a flat card
        // lights flat/dark; fanning the normal makes it shade like a rounded blade.
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nobjectNormal = normalize(objectNormal + vec3(position.x * 8.0, 0.0, 0.0));',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
            vBladeH = clamp(position.y / ${BLADE_H.toFixed(3)}, 0.0, 1.0);
            #ifdef USE_INSTANCING
              vec3 iPos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            #else
              vec3 iPos = vec3(0.0);
            #endif
            float ph = iPos.x * 0.4 + iPos.z * 0.45;
            vTint = fract(sin(dot(iPos.xz, vec2(12.9898, 78.233))) * 43758.5453); // per-blade rng
            float wind = (sin(uTime * 1.3 + ph) + 0.5 * sin(uTime * 2.4 + ph * 1.7)) * uWind * 0.07;
            float bend = vBladeH * vBladeH; // top bends most
            transformed.x += wind * bend + (vTint - 0.5) * 0.1 * bend; // gentle wind + per-blade lean
            transformed.z += wind * 0.4 * bend;
          `,
        )
        // World-space player stomp: bend (and slightly flatten) blade tops away
        // from the moving player. Done after the instance transform so the push
        // is in true world directions; gated by uPlayerMove so it only reacts
        // while moving.
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             mvPosition = instanceMatrix * mvPosition;
           #endif
           vec4 worldPos = modelMatrix * mvPosition;
           {
             vec2 toBlade = worldPos.xz - uPlayer;
             float pd = length(toBlade);
             float infl = smoothstep(uStompRadius, 0.0, pd) * uPlayerMove;
             vec2 dir = pd > 1e-3 ? toBlade / pd : vec2(0.0);
             float h = vBladeH * vBladeH;
             worldPos.xz += dir * infl * uStomp * h;
             worldPos.y  -= infl * uStomp * 0.5 * h;
           }
           mvPosition = viewMatrix * worldPos;
           gl_Position = projectionMatrix * mvPosition;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uBase;\nuniform vec3 uTip;\nvarying float vBladeH;\nvarying float vTint;',
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec3 grassCol = mix(uBase, uTip, vBladeH);
           grassCol *= 0.82 + 0.36 * vTint;            // some blades darker, some lighter
           grassCol.r += (vTint - 0.5) * 0.06;          // warm (yellow-green) ↔ cool shift
           grassCol.b += (0.5 - vTint) * 0.04;
           vec4 diffuseColor = vec4( grassCol, opacity );`,
        );

      uniforms.current = shader.uniforms;
    };
    m.customProgramCacheKey = () => 'grass-blades';
    return m;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const o = new Object3D();
    let placed = 0;
    // Sample candidates and accept by lushness → clumped patches + bald spots,
    // not an even carpet. Bounded attempts so dense areas still fill in.
    for (let attempt = 0; attempt < COUNT * 3 && placed < COUNT; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      if (!onGrass(x, z)) continue; // never on plaza / streets / props

      const lush = lushness(x, z); // 0..1
      // Density: sparse areas keep a thin floor (~15%), lush patches fill in.
      if (Math.random() > 0.15 + lush * lush) continue;

      o.position.set(x, 0, z);
      o.rotation.set(0, Math.random() * Math.PI, 0);
      // Height by region (taller in lush patches) × per-blade variation; width varies too.
      const region = 0.6 + lush * 0.8;
      o.scale.set(0.65 + Math.random() * 0.8, (0.5 + Math.random() * 0.9) * region, 1);
      o.updateMatrix();
      mesh.setMatrixAt(placed++, o.matrix);
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    const u = uniforms.current;
    if (!u) return;
    u.uTime!.value += delta;
    const g = useEnvStore.getState().town;
    u.uWind!.value = g.grassWind;
    (u.uBase!.value as Color).set(g.grassDark);
    (u.uTip!.value as Color).set(g.grassLight);

    // Player stomp: follow the local player and ramp the effect by movement.
    const t = getLocalRenderTransform();
    const player = u.uPlayer!.value as Vector2;
    if (t.active) {
      const speed = Math.hypot(t.x - last.current.x, t.z - last.current.y) / Math.max(delta, 1e-3);
      player.set(t.x, t.z);
      last.current.set(t.x, t.z);
      const target = Math.min(1, speed / 3);
      u.uPlayerMove!.value += (target - u.uPlayerMove!.value) * Math.min(1, delta * 6);
    } else {
      u.uPlayerMove!.value *= 1 - Math.min(1, delta * 4);
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, COUNT]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  );
}
