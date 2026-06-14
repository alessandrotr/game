import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide } from 'three';
import type { PedestalEffect } from '@arena/shared';

/**
 * The glowing circle under the champion in the 3D portrait. `ring` is the plain
 * two-ring rune (cheap, used for the default + classic colored pedestals); the
 * animated effects are a single additive-blended quad driven by a fragment
 * shader (one draw call, no textures), so they stay light enough to run in the
 * always-on HUD portrait as well as the big showcase.
 */

/** Effect → shader branch id (keep in sync with the `uMode` switch in FRAG). */
const MODE: Record<Exclude<PedestalEffect, 'ring'>, number> = {
  pulse: 1,
  aurora: 2,
  holo: 3,
  vortex: 4,
  prism: 5,
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform int uMode;
  uniform vec3 uColor;
  uniform vec3 uColor2;

  const float TAU = 6.28318530718;

  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;     // [-1, 1]
    float r = length(p);
    if (r > 1.0) discard;            // clip to the disc
    float a = atan(p.y, p.x);
    float t = uTime;
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (uMode == 1) {                // PULSE — energy waves rippling outward
      float w = sin(r * 20.0 - t * 4.5);
      float rings = smoothstep(0.55, 1.0, w);
      col = uColor * (0.5 + rings * 1.3);
      alpha = (rings * 0.85 + 0.08) * smoothstep(1.0, 0.15, r);
    } else if (uMode == 2) {         // AURORA — drifting ribbon of light
      float band = smoothstep(0.42, 0.52, r) * smoothstep(1.0, 0.9, r);
      float flow = 0.5 + 0.5 * sin(a * 3.0 + t * 1.3 + sin(a * 2.0 - t * 0.7) * 1.6);
      float shimmer = 0.6 + 0.4 * sin(a * 9.0 - t * 2.0);
      col = mix(uColor, uColor2, flow) * (0.7 + 0.6 * shimmer);
      alpha = band * (0.4 + 0.6 * flow);
    } else if (uMode == 3) {         // HOLO — flickering scanline deck
      float scan = 0.5 + 0.5 * sin(r * 70.0 - t * 7.0);
      float spokes = 0.5 + 0.5 * sin(a * 24.0);
      float flick = 0.8 + 0.2 * hash(vec2(floor(t * 14.0), floor(r * 22.0)));
      float edge = smoothstep(1.0, 0.65, r);
      col = uColor * (0.35 + 0.65 * scan) * flick;
      alpha = edge * (0.22 + 0.45 * scan * spokes);
    } else if (uMode == 4) {         // VORTEX — spiral winding inward
      float arms = sin(a * 4.0 + r * 12.0 - t * 3.5);
      float spiral = smoothstep(0.25, 1.0, arms);
      float core = smoothstep(0.35, 0.0, r);          // bright singularity center
      col = mix(uColor, uColor2, spiral) + uColor2 * core * 1.2;
      alpha = (spiral * smoothstep(1.0, 0.08, r) * smoothstep(0.06, 0.22, r)) + core * 0.9;
    } else if (uMode == 5) {         // PRISM — rotating full spectrum
      float band = smoothstep(0.46, 0.55, r) * smoothstep(1.0, 0.92, r);
      float hue = fract(a / TAU + t * 0.18 + r * 0.2);
      col = hsv2rgb(vec3(hue, 0.85, 1.0));
      alpha = band;
    } else {                         // 0 — plain ring fallback
      float band = smoothstep(0.6, 0.68, r) * smoothstep(1.0, 0.92, r);
      col = uColor;
      alpha = band * 0.8;
    }

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The animated effect layer (a single shader quad lying flat on the base). The
 *  uniforms object is created once and mutated in place — three reads its
 *  `.value`s each frame, so this drives the animation without React churn. */
function ShaderDisc({ mode, color, color2 }: { mode: number; color: string; color2?: string }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMode: { value: mode },
      uColor: { value: new Color(color) },
      uColor2: { value: new Color(color2 ?? color) },
    }),
    // Created once; live changes are written in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Reflect prop changes (re-equipping a different pedestal) without remounting.
  useEffect(() => {
    uniforms.uMode.value = mode;
    uniforms.uColor.value.set(color);
    uniforms.uColor2.value.set(color2 ?? color);
  }, [uniforms, mode, color, color2]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
  });

  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1.5, 96]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
      />
    </mesh>
  );
}

export interface PedestalProps {
  effect?: PedestalEffect;
  color: string;
  color2?: string;
}

export function Pedestal({ effect = 'ring', color, color2 }: PedestalProps) {
  return (
    <group>
      {/* Physical base disc. */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[1.35, 1.5, 0.1, 64]} />
        <meshStandardMaterial color="#14151d" metalness={0.5} roughness={0.5} />
      </mesh>

      {effect === 'ring' ? (
        <>
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.12, 1.32, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} />
          </mesh>
        </>
      ) : (
        <ShaderDisc mode={MODE[effect]} color={color} color2={color2} />
      )}
    </group>
  );
}
