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
import { TOWN_HALF_SIZE, TOWN_OBSTACLES } from '@arena/shared';
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
 * Placement is a dense square ring hugging the town's outer edge — a "wall" of
 * tall grass that frames the play area rather than a carpet scattered through the
 * interior. Blades rise toward the boundary so the band reads as a bank.
 */

const COUNT = 26000;
const BLADE_H = 0.32;
/** Margin (world units) kept clear around every non-grass surface. */
const MARGIN = 0.4;
/** The grass wall is a square ring from BAND_INNER out to the town edge — a
 *  narrow, dense band so it reads as a tall hedge, not a meadow. */
const BAND_INNER = 39;
const BAND_OUTER = TOWN_HALF_SIZE - 1; // just inside the boundary

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

/** True where a wall blade may stand: clear of any prop/building footprint (the
 *  obstacle circles cover houses, towers, the castle/walls, stalls, the well, …). */
function onGrass(x: number, z: number): boolean {
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
    // Fill the perimeter ring: sample the town square, keep only the outer band,
    // and thin it by lushness so the wall clumps naturally instead of reading as
    // a solid hedge. Bounded attempts (the interior is rejected, ~half the square).
    for (let attempt = 0; attempt < COUNT * 8 && placed < COUNT; attempt++) {
      const x = (Math.random() * 2 - 1) * BAND_OUTER;
      const z = (Math.random() * 2 - 1) * BAND_OUTER;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge < BAND_INNER) continue; // interior stays clear — wall only
      if (!onGrass(x, z)) continue; // never on a prop footprint

      const lush = lushness(x, z); // 0..1
      // Near-solid fill (only the odd gap), so the band reads as a dense wall.
      if (Math.random() > 0.85 + lush * 0.15) continue;

      // 0..1 outward across the band → blades rise toward the town's edge (a bank).
      const t = (edge - BAND_INNER) / (BAND_OUTER - BAND_INNER);
      o.position.set(x, 0, z);
      o.rotation.set(0, Math.random() * Math.PI, 0);
      const tall = 3.5 + t * 4.5; // tall at the inner lip, towering against the wall
      o.scale.set(0.7 + Math.random() * 0.7, tall * (0.85 + Math.random() * 0.3), 1);
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
