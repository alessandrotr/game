import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, type Mesh, type ShaderMaterial } from 'three';

/**
 * A cheap, punchy fireball: a single camera-facing quad with a procedural fire
 * shader (scrolling turbulence + a white-hot core), additive-blended so it glows.
 * The only animation cost is advancing one `uTime` uniform and a per-frame scalar
 * throb on the mesh — there are only ever a few projectiles in flight, so it's
 * effectively free. No lights, no post-processing, one draw call each.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // 3-octave fbm — enough turbulence to read as fire, cheap enough for realtime.
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;                 // 0 centre .. 1 edge

    // Fast turbulence scrolling up + a counter-scrolling layer → lively licks.
    float n = fbm(vUv * 3.0 + vec2(0.0, -uTime * 2.6));
    n += 0.5 * fbm(vUv * 7.0 + vec2(uTime * 0.9, -uTime * 3.8));

    // Global flicker so the whole ball pulses brightness.
    float flick = 0.85 + 0.15 * sin(uTime * 26.0 + n * 6.2832);

    float fire = smoothstep(1.1, 0.0, r) * (0.5 + 0.95 * n) * flick;
    // Deep red → orange → white-hot core (punchier ramp).
    vec3 col = mix(vec3(0.8, 0.06, 0.0), vec3(1.0, 0.5, 0.06), smoothstep(0.1, 0.5, fire));
    col = mix(col, vec3(1.0, 0.97, 0.75), smoothstep(0.55, 1.0, fire));

    float alpha = smoothstep(0.04, 0.45, fire) * (1.0 - smoothstep(0.88, 1.08, r));
    // Brighter additive output so it reads clearly against any background.
    gl_FragColor = vec4(col * (1.1 + fire * 2.0), alpha);
  }
`;

export function FireballEffect({ radius = 0.8 }: { radius?: number }) {
  const material = useRef<ShaderMaterial>(null);
  const mesh = useRef<Mesh>(null);
  // Random phase so multiple fireballs don't flicker/throb in lockstep.
  const seed = useMemo(() => Math.random() * 10, []);
  const uniforms = useMemo(() => ({ uTime: { value: seed } }), [seed]);

  useFrame((_, delta) => {
    const u = material.current?.uniforms.uTime;
    if (u) u.value += delta;
    // Cheap throb: scale pulses ~±10% (slightly taller → flame-shaped).
    const m = mesh.current;
    if (u && m) {
      const s = 1 + 0.1 * Math.sin(u.value * 16 + seed);
      m.scale.set(s, s * 1.12, s);
    }
  });

  return (
    <Billboard>
      <mesh ref={mesh}>
        <planeGeometry args={[radius * 2, radius * 2]} />
        <shaderMaterial
          ref={material}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}
