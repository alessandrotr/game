import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, type ShaderMaterial } from 'three';

/**
 * An animated "magic portal": a vertical disc of swirling plasma with a hot
 * glowing rim, drawn with a custom GLSL shader (additive, transparent) so it
 * reads as a glowing gateway inside the stone arch. One cheap mesh + a single
 * time uniform — no textures.
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
  uniform vec3 uCore;
  uniform vec3 uEdge;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;            // 0 at centre, 1 at the disc edge
    float a = atan(p.y, p.x);

    // Spiral: angle advances with radius and time, so bands swirl inward.
    float swirl = a + r * 5.0 - uTime * 2.2;
    float n = noise(vec2(swirl * 1.4, r * 4.0 - uTime * 1.6));
    n += 0.5 * noise(vec2(swirl * 3.0 + 11.0, r * 8.0 + uTime));
    float bands = 0.5 + 0.5 * sin(swirl * 3.0 + n * 6.2);

    // Bright core, swirling mid, and a hot ring at the rim.
    float core = smoothstep(0.95, 0.0, r);
    float ring = smoothstep(0.78, 0.99, r) * (1.0 - smoothstep(0.99, 1.06, r));
    float pulse = 0.85 + 0.15 * sin(uTime * 3.0);

    vec3 col = mix(uEdge, uCore, core);
    col += uCore * bands * 0.7 * (1.0 - r);
    col += vec3(1.0) * ring * 1.3;        // white-hot rim
    col *= pulse;

    float alpha = (1.0 - smoothstep(0.82, 1.0, r));
    alpha = max(alpha, ring);
    gl_FragColor = vec4(col, alpha);
  }
`;

interface PortalEffectProps {
  /** Disc radius (world units). */
  radius?: number;
  /** Bright inner colour. */
  core?: string;
  /** Outer/edge colour. */
  edge?: string;
}

export function PortalEffect({ radius = 1.6, core = '#cdeeff', edge = '#1f6fe0' }: PortalEffectProps) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCore: { value: new Color(core) },
      uEdge: { value: new Color(edge) },
    }),
    [core, edge],
  );

  useFrame((_, delta) => {
    const u = material.current?.uniforms.uTime;
    if (u) u.value += delta;
  });

  return (
    <group position={[0, radius + 0.15, 0]}>
      <mesh>
        <circleGeometry args={[radius, 64]} />
        <shaderMaterial
          ref={material}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
