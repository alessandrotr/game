import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, type ShaderMaterial } from 'three';

/**
 * Falling-water veil for a fountain: an open-ended cone (the spill from a bowl
 * rim down to the pool) whose shader breaks the surface into vertical streams
 * and scrolls bright highlights downward — so it reads as moving water, not a
 * static translucent shell. Cheap (one mesh, one time uniform).
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uColorR; // right-side (red team) tint

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    // v = 1 at the rim (top), 0 at the pool (bottom). Adding the scroll offset to
    // the sample coordinate makes the pattern travel DOWNWARD over time.
    float fall = uTime * 1.7;

    // Fine flowing threads (two layers at different scales/speeds) → moving water.
    float threads =
      noise(vec2(vUv.x * 70.0, vUv.y * 7.0 + fall)) * 0.55 +
      noise(vec2(vUv.x * 30.0, vUv.y * 3.5 + fall * 0.7)) * 0.45;
    threads = smoothstep(0.42, 0.95, threads);

    // A few wider streams stand out, but the sheet stays continuous (no hard gaps).
    float sheet = 0.55 + 0.45 * noise(vec2(vUv.x * 9.0, 0.0));

    // Brighter at the rim; fade softly into the pool (splash) at the bottom.
    float vert = smoothstep(0.0, 0.1, vUv.y) * (0.5 + 0.5 * vUv.y);

    float alpha = (0.16 * sheet + threads * 0.6) * vert;
    // Split blue (left) / red (right) by world X, matching the pools below.
    vec3 tint = mix(uColor, uColorR, smoothstep(-0.4, 0.4, vWorldPos.x));
    vec3 col = tint + threads * 0.4;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
  }
`;

interface WaterStreamProps {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  position?: [number, number, number];
  color?: string;
  /** Right-side (red team) tint. Defaults to `color` (no split). */
  colorRight?: string;
}

export function WaterStream({
  radiusTop,
  radiusBottom,
  height,
  position = [0, 0, 0],
  color = '#bfe9ff',
  colorRight,
}: WaterStreamProps) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new Color() }, uColorR: { value: new Color() } }),
    [],
  );

  useEffect(() => {
    uniforms.uColor.value.set(color);
    uniforms.uColorR.value.set(colorRight ?? color);
  }, [color, colorRight, uniforms]);

  useFrame((_, delta) => {
    const u = material.current?.uniforms.uTime;
    if (u) u.value += delta;
  });

  return (
    <mesh position={position}>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, 48, 1, true]} />
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
