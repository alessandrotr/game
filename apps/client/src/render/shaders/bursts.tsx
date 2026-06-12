import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending } from 'three';
import { GLSL_NOISE, UV_VERTEX, useBurstClock, yawFromDirection, type BurstShaderProps } from './common';

/**
 * One-shot "burst" shaders: ground rings, slashes, rising light and streaks.
 * Each is a single quad (a flat ground disc or a camera-facing billboard) with
 * a procedural fragment shader driven by `uProgress` (0→1 over its lifetime).
 * `useBurstClock` advances the uniforms and unmounts the effect when done — one
 * draw call, no textures, no lights.
 */

/** A flat ground quad carrying a burst shader (optionally yaw-oriented). */
function GroundBurst({
  size,
  frag,
  durationMs,
  onComplete,
  direction,
  y = 0.06,
}: BurstShaderProps & { size: number; frag: string; y?: number }) {
  const { matRef, seed } = useBurstClock(durationMs, onComplete);
  const uniforms = useMemo(() => ({ uTime: { value: seed }, uProgress: { value: 0 } }), [seed]);
  return (
    <group rotation={[0, yawFromDirection(direction), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
        <planeGeometry args={[size, size]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={frag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/** A camera-facing billboard quad carrying a burst shader (for vertical effects). */
function BillboardBurst({
  width,
  height,
  frag,
  durationMs,
  onComplete,
  y = 1.0,
}: BurstShaderProps & { width: number; height: number; frag: string; y?: number }) {
  const { matRef, seed } = useBurstClock(durationMs, onComplete);
  const uniforms = useMemo(() => ({ uTime: { value: seed }, uProgress: { value: 0 } }), [seed]);
  return (
    <Billboard position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={frag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}

// --- Frost Nova: an expanding icy ring with crystalline radial spikes. -------

const frostFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float edge = uProgress * 0.95;
    float ring = smoothstep(0.07, 0.0, abs(r - edge));
    // Crystalline spikes radiating outward inside the expanding front.
    float spikes = pow(max(0.0, cos(ang * 8.0)), 10.0) * smoothstep(edge + 0.05, 0.0, r);
    float shimmer = 0.7 + 0.3 * noise(p * 16.0 + uTime * 4.0);
    float v = (ring + spikes * 0.8) * shimmer;
    vec3 col = mix(vec3(0.45, 0.82, 1.0), vec3(0.92, 0.99, 1.0), ring);
    gl_FragColor = vec4(col * v * 2.0, v * (1.0 - uProgress));
  }
`;
export const FrostNovaEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={11} frag={frostFrag} />;

// --- Arcane Blast: a violet implosion flash → expanding runic shockwave. -----

const arcaneBlastFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float edge = uProgress * 0.95;
    float ring = smoothstep(0.08, 0.0, abs(r - edge));
    // Rotating runic spokes; a hot central flash early in the cast.
    float glyph = pow(max(0.0, sin(ang * 6.0 + uTime * 4.0)), 6.0) * smoothstep(edge, 0.0, r);
    float flash = smoothstep(0.5, 0.0, r) * (1.0 - smoothstep(0.0, 0.35, uProgress));
    float v = ring + glyph * 0.5 + flash;
    vec3 col = mix(vec3(0.55, 0.28, 1.0), vec3(0.93, 0.85, 1.0), ring + flash);
    gl_FragColor = vec4(col * v * 2.0, v * (1.0 - uProgress * 0.9));
  }
`;
export const ArcaneBlastEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={9} frag={arcaneBlastFrag} />;

// --- Ground Slam: a heavy dust shockwave with radial cracks. -----------------

const groundSlamFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float edge = uProgress * 0.95;
    float ring = smoothstep(0.14, 0.0, abs(r - edge)) * 1.2;
    // Jagged cracks shooting out from the impact.
    float cracks = pow(max(0.0, cos(ang * 6.0)), 18.0) * smoothstep(edge, 0.0, r);
    float dust = noise(p * 7.0 + uTime * 1.5) * smoothstep(edge + 0.15, 0.0, r) * 0.5;
    float v = ring + cracks * 0.9 + dust;
    vec3 col = mix(vec3(0.5, 0.26, 0.1), vec3(1.0, 0.62, 0.22), ring + cracks * 0.4);
    gl_FragColor = vec4(col * v * 2.0, v * (1.0 - uProgress * 0.85));
  }
`;
export const GroundSlamEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={13} frag={groundSlamFrag} />;

// --- Cleave: a fast steel crescent sweeping in front of the warrior. ---------

const cleaveFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    // Angle measured from "forward" (+y of the oriented quad).
    float a = atan(p.x, p.y);
    float arc = smoothstep(0.14, 0.0, abs(r - 0.7));        // a thin crescent band
    float spread = smoothstep(1.1, 0.2, abs(a));            // only in front (~±60°)
    // The blade sweeps from one side to the other over the cast.
    float sweep = smoothstep(0.5, 0.0, abs(a - (uProgress - 0.5) * 1.8));
    float v = arc * spread * (0.4 + 0.6 * sweep);
    vec3 col = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.95, 0.85), sweep);
    gl_FragColor = vec4(col * v * 2.2, v * (1.0 - uProgress));
  }
`;
export const CleaveEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={6} frag={cleaveFrag} />;

// --- Cast Rune: a quick neutral double-ring + glyph (generic cast flash). -----

const castRuneFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float r1 = smoothstep(0.05, 0.0, abs(r - 0.45 * uProgress));
    float r2 = smoothstep(0.04, 0.0, abs(r - 0.8 * uProgress));
    float glyph = pow(max(0.0, sin(ang * 6.0 + uTime * 3.0)), 8.0) * smoothstep(0.8 * uProgress, 0.0, r);
    float v = r1 + r2 + glyph * 0.4;
    vec3 col = mix(vec3(0.55, 0.78, 1.0), vec3(0.92, 0.98, 1.0), r2);
    gl_FragColor = vec4(col * v * 2.0, v * (1.0 - uProgress));
  }
`;
export const CastRuneEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={3.5} frag={castRuneFrag} />;

// --- Heal: a soft column of rising green-gold motes + a base halo. -----------

const healFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    float column = smoothstep(0.5, 0.0, abs(uv.x - 0.5)) * smoothstep(1.0, 0.1, uv.y);
    // Motes drifting upward.
    float motes = smoothstep(0.55, 0.9, noise(uv * vec2(7.0, 4.0) + vec2(0.0, -uTime * 1.6)));
    motes *= smoothstep(0.5, 0.0, abs(uv.x - 0.5));
    float halo = smoothstep(0.18, 0.0, distance(uv, vec2(0.5, 0.12)));
    float v = column * 0.5 + motes * 0.9 + halo;
    vec3 col = mix(vec3(0.45, 1.0, 0.6), vec3(1.0, 0.97, 0.6), uv.y);
    float fade = smoothstep(1.0, 0.85, uProgress);   // ease out at the very end
    gl_FragColor = vec4(col * v * 1.8, v * fade);
  }
`;
export const HealEffect = (p: BurstShaderProps) => (
  <BillboardBurst {...p} width={2.0} height={2.6} frag={healFrag} y={1.1} />
);

// --- Condemn: a column of holy light slams down + a base flare (priest ult). -

const condemnFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    // Beam snaps to full quickly, then fades.
    float drop = smoothstep(0.0, 0.25, uProgress);
    float beam = smoothstep(0.42, 0.0, abs(uv.x - 0.5)) * drop;
    float flicker = 0.8 + 0.2 * noise(uv * vec2(3.0, 10.0) + vec2(0.0, -uTime * 2.0));
    float flare = smoothstep(0.22, 0.0, distance(uv, vec2(0.5, 0.08))) * drop;
    float v = beam * flicker + flare * 1.4;
    vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 1.0, 0.92), uv.y * 0.6 + flare);
    float fade = 1.0 - smoothstep(0.4, 1.0, uProgress);
    gl_FragColor = vec4(col * v * 2.0, v * fade);
  }
`;
export const CondemnEffect = (p: BurstShaderProps) => (
  <BillboardBurst {...p} width={2.4} height={3.4} frag={condemnFrag} y={1.5} />
);

// --- Dash: a directional motion-blur streak (warrior charge / archer tumble).

const dashFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    // Horizontal streaks that smear along travel, brightest at the trailing edge.
    float band = smoothstep(0.5, 0.0, abs(uv.y - 0.5));
    float streak = smoothstep(0.4, 0.9, noise(vec2(uv.x * 3.0 - uTime * 4.0, uv.y * 18.0)));
    float trail = smoothstep(1.0, 0.0, uv.x);            // fades toward the front
    float v = band * (0.3 + streak) * trail;
    vec3 col = mix(vec3(0.7, 0.85, 1.0), vec3(1.0), streak);
    float fade = 1.0 - uProgress;
    gl_FragColor = vec4(col * v * 2.0, v * fade);
  }
`;
export const DashEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={7} frag={dashFrag} y={0.7} />;
