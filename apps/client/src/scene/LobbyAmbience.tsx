import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  type ShaderMaterial,
} from 'three';
import { useQualityStore } from '../store/useQualityStore';
import { LOBBY_CHIMNEYS, LOBBY_HALOS } from './lobbyLayout';
import { usePointScale } from './usePointScale';

/**
 * Life for the lobby: glow halos on every lantern / brazier / the fountain crystal
 * (a cheap stand-in for bloom — there is no post-processing in this renderer),
 * fireflies drifting over the gardens, and smoke curling from the chimneys.
 *
 * Everything is a single `Points` draw call per effect with all animation done in
 * the vertex shader, so it costs nothing on the CPU and a few KB of GPU memory.
 * Fireflies + smoke are skipped on the Low tier.
 */

const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vColor = aColor;
    vFade = 1.0;
    vec3 p = position;
    float size = aSize;
    MOTION
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 1.0, 220.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), SHARPNESS) * vFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a * GAIN, a * ALPHA);
  }
`;

function makeGeometry(
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  phases: Float32Array,
): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('aColor', new BufferAttribute(colors, 3));
  g.setAttribute('aSize', new BufferAttribute(sizes, 1));
  g.setAttribute('aPhase', new BufferAttribute(phases, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius = Math.max(g.boundingSphere.radius, 120);
  return g;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------- halos
function Halos() {
  const mat = useRef<ShaderMaterial>(null);
  usePointScale(mat);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uScale: { value: 800 } }), []);
  const geo = useMemo(() => {
    const n = LOBBY_HALOS.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const ph = new Float32Array(n);
    const rnd = seeded(7);
    const c = new Color();
    LOBBY_HALOS.forEach((h, i) => {
      pos.set(h.pos, i * 3);
      c.set(h.color);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = h.size;
      ph[i] = rnd() * 6.28;
    });
    return makeGeometry(pos, col, size, ph);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s) => {
    const u = mat.current?.uniforms.uTime;
    if (u) u.value = s.clock.elapsedTime;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={POINT_VERT.replace(
          'MOTION',
          // gentle candle-like flicker on the size
          'size *= 0.88 + 0.12 * sin(uTime * (4.0 + aPhase) + aPhase * 17.0) + 0.05 * sin(uTime * 11.0 + aPhase);',
        )}
        fragmentShader={POINT_FRAG.replace('SHARPNESS', '2.6')
          .replace('GAIN', '0.85')
          .replace('ALPHA', '0.0')}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------- fireflies
const FIREFLY_COUNT = 110;

function Fireflies() {
  const mat = useRef<ShaderMaterial>(null);
  usePointScale(mat);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uScale: { value: 800 } }), []);
  const geo = useMemo(() => {
    const pos = new Float32Array(FIREFLY_COUNT * 3);
    const col = new Float32Array(FIREFLY_COUNT * 3);
    const size = new Float32Array(FIREFLY_COUNT);
    const ph = new Float32Array(FIREFLY_COUNT);
    const rnd = seeded(31);
    const c = new Color();
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      // scatter over the gardens, keeping clear of the plaza itself
      let x = 0;
      let z = 0;
      for (let t = 0; t < 20; t++) {
        x = (rnd() * 2 - 1) * 44;
        z = (rnd() * 2 - 1) * 44;
        if (Math.hypot(x, z + 2) > 17) break;
      }
      pos.set([x, 0.7 + rnd() * 2.2, z], i * 3);
      c.set(rnd() < 0.25 ? '#9dffd0' : '#e8ff8a');
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 0.16 + rnd() * 0.12;
      ph[i] = rnd() * 6.28;
    }
    return makeGeometry(pos, col, size, ph);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s) => {
    const u = mat.current?.uniforms.uTime;
    if (u) u.value = s.clock.elapsedTime;
  });
  const motion = /* glsl */ `
    float t = uTime * (0.25 + 0.2 * fract(aPhase));
    p.x += sin(t * 1.3 + aPhase * 9.0) * 1.6 + sin(t * 0.37 + aPhase) * 0.9;
    p.z += cos(t * 1.1 + aPhase * 7.0) * 1.6 + cos(t * 0.43 + aPhase * 2.0) * 0.9;
    p.y += sin(t * 1.7 + aPhase * 5.0) * 0.5;
    // slow blink: mostly dim, brief bright pulses
    float blink = pow(max(0.0, sin(uTime * (0.9 + fract(aPhase * 3.0)) + aPhase * 13.0)), 3.0);
    vFade = 0.15 + 0.85 * blink;
    size *= 0.6 + 0.6 * blink;
  `;
  return (
    <points geometry={geo} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={POINT_VERT.replace('MOTION', motion)}
        fragmentShader={POINT_FRAG.replace('SHARPNESS', '1.6')
          .replace('GAIN', '1.6')
          .replace('ALPHA', '0.0')}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------- chimney smoke
const PUFFS_PER_CHIMNEY = 7;

function Smoke() {
  const mat = useRef<ShaderMaterial>(null);
  usePointScale(mat);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uScale: { value: 800 } }), []);
  const geo = useMemo(() => {
    const n = LOBBY_CHIMNEYS.length * PUFFS_PER_CHIMNEY;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const ph = new Float32Array(n);
    const rnd = seeded(77);
    const c = new Color('#b9b2ad');
    LOBBY_CHIMNEYS.forEach((p, ci) => {
      for (let k = 0; k < PUFFS_PER_CHIMNEY; k++) {
        const i = ci * PUFFS_PER_CHIMNEY + k;
        pos.set(p, i * 3);
        col.set([c.r, c.g, c.b], i * 3);
        size[i] = 0.9 + rnd() * 0.5;
        ph[i] = (k + rnd() * 0.5) / PUFFS_PER_CHIMNEY; // staggered life offsets
      }
    });
    return makeGeometry(pos, col, size, ph);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s) => {
    const u = mat.current?.uniforms.uTime;
    if (u) u.value = s.clock.elapsedTime;
  });
  const motion = /* glsl */ `
    float life = fract(uTime * 0.11 + aPhase);
    p.y += life * 6.5;
    p.x += life * life * 2.6 + sin(life * 6.0 + aPhase * 40.0) * 0.35 * life;   // drifts downwind, wobbles
    p.z += life * 0.9;
    size *= 0.5 + life * 3.2;
    vFade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life)) * 0.55;
  `;
  return (
    <points geometry={geo} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        blending={NormalBlending}
        uniforms={uniforms}
        vertexShader={POINT_VERT.replace('MOTION', motion)}
        fragmentShader={POINT_FRAG.replace('SHARPNESS', '1.3')
          .replace('GAIN', '0.55')
          .replace('ALPHA', '0.5')}
      />
    </points>
  );
}

export function LobbyAmbience() {
  const tier = useQualityStore((s) => s.tier);
  return (
    <group>
      <Halos />
      {tier !== 'low' && <Fireflies />}
      {tier !== 'low' && <Smoke />}
    </group>
  );
}
