import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, type ShaderMaterial } from 'three';

/**
 * A flat, animated water surface drawn with a custom shader: a few directional
 * waves perturb the surface normal (analytic gradient, no texture), driving a
 * fresnel sky-reflection, a sharp sun specular, and fine sparkle. Reads as
 * realistic moving water on a small pool while staying cheap (one disc, one
 * time uniform). Lay it flat; sized by `radius`.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vViewDir = cameraPosition - wp.xyz; // cameraPosition is injected for the vertex stage
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uDeepR;     // right-side (red team) deep/shallow
  uniform vec3 uShallowR;
  uniform vec3 uSky;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 p = vWorldPos.xz;
    float t = uTime;

    // Surface normal from a few directional waves (analytic height gradient).
    vec2 grad = vec2(0.0);
    vec2 d1 = normalize(vec2(1.0, 0.6));  grad += 0.025 * 1.6 * d1 * cos(dot(d1, p) * 1.6 + t * 1.3);
    vec2 d2 = normalize(vec2(-0.7, 1.0)); grad += 0.018 * 2.3 * d2 * cos(dot(d2, p) * 2.3 + t * 1.7);
    vec2 d3 = normalize(vec2(0.3, -1.0)); grad += 0.010 * 4.1 * d3 * cos(dot(d3, p) * 4.1 + t * 2.4);
    vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));

    vec3 viewDir = normalize(vViewDir);
    float fres = pow(clamp(1.0 - dot(viewDir, n), 0.0, 1.0), 3.0);

    // Team-split the water by world X: left side (x<0) keeps the blue palette,
    // right side (x>0) the red one, with a soft seam at the fountain's centre.
    float side = smoothstep(-0.6, 0.6, vWorldPos.x);
    vec3 deepCol = mix(uDeep, uDeepR, side);
    vec3 shallowCol = mix(uShallow, uShallowR, side);

    // Deeper toward the centre, shallower toward the rim.
    float r = length(vUv - 0.5) * 2.0;
    vec3 base = mix(deepCol, shallowCol, smoothstep(0.2, 1.0, r) * 0.6 + 0.2);
    vec3 col = mix(base, uSky, fres * 0.65);

    // Sun specular (Blinn-Phong) + glinting sparkle.
    vec3 sun = normalize(vec3(0.4, 0.85, 0.3));
    vec3 h = normalize(sun + viewDir);
    col += pow(max(dot(n, h), 0.0), 90.0) * 1.4;
    col += pow(noise(p * 7.0 + t * 0.6), 24.0) * 0.5;

    gl_FragColor = vec4(col, 0.85 + fres * 0.15);
  }
`;

interface WaterSurfaceProps {
  radius: number;
  segments?: number;
  position?: [number, number, number];
  deep?: string;
  shallow?: string;
  sky?: string;
  /** Right-side (red team) palette. Defaults to the left palette (no split). */
  redDeep?: string;
  redShallow?: string;
}

export function WaterSurface({
  radius,
  segments = 48,
  position = [0, 0, 0],
  deep = '#0c3a4d',
  shallow = '#2f93b3',
  sky = '#cdeeff',
  redDeep,
  redShallow,
}: WaterSurfaceProps) {
  const material = useRef<ShaderMaterial>(null);
  // Allocate uniforms ONCE (swapping the object on a live material freezes it);
  // colours are updated in place below.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new Color() },
      uShallow: { value: new Color() },
      uDeepR: { value: new Color() },
      uShallowR: { value: new Color() },
      uSky: { value: new Color() },
    }),
    [],
  );

  useEffect(() => {
    uniforms.uDeep.value.set(deep);
    uniforms.uShallow.value.set(shallow);
    uniforms.uDeepR.value.set(redDeep ?? deep);
    uniforms.uShallowR.value.set(redShallow ?? shallow);
    uniforms.uSky.value.set(sky);
  }, [deep, shallow, sky, redDeep, redShallow, uniforms]);

  useFrame((_, delta) => {
    const u = material.current?.uniforms.uTime;
    if (u) u.value += delta;
  });

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
      <circleGeometry args={[radius, segments]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
