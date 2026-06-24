import { useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, Color, type ShaderMaterial } from 'three';
import { GLSL_NOISE, UV_VERTEX, useUTime, withTint, tintUniforms } from './common';

/** Props common to every projectile shader: collision-radius size + an optional
 *  weapon glow color that recolors the bolt to the caster's equipped weapon. */
export interface ProjectileShaderProps {
  radius?: number;
  tint?: string;
}

/**
 * Looping projectile shaders: each is a single camera-facing quad with a
 * procedural fragment shader, additive-blended so it glows. Only `uTime` is
 * advanced per frame (one cheap uniform), and there are only ever a handful of
 * projectiles in flight — one draw call each, no textures, no lights.
 */

// --- Electric Bolt: an orb wrapped in crackling electric filaments (the look
// shared by the mage's Arcane Bolt and the archer's Power Shot). Colour-tunable.
// The quad is sized to the projectile's collision radius, so the glow reads as
// the actual hit area — the VFX never extends past where it can connect. --------

const electricBoltFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float core = smoothstep(0.55, 0.0, r);
    // Crackling arcs: high-frequency noise filaments that writhe over time.
    float arcs = pow(noise(p * 9.0 + vec2(uTime * 5.0, -uTime * 4.0)), 3.0);
    arcs += pow(noise(p * 16.0 - uTime * 7.0), 4.0) * 0.6;
    arcs *= smoothstep(1.0, 0.15, r);
    float bolt = core + arcs;
    vec3 col = mix(uColor, vec3(1.0), core + arcs * 0.4);
    // Hard cutoff at the quad edge → the glow stays inside the collision radius.
    float a = smoothstep(0.05, 0.45, bolt) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col * (1.1 + bolt * 2.2), a);
  }
`;

export function ElectricBoltEffect({
  color = '#7330ff',
  radius = 0.6,
  tint,
}: ProjectileShaderProps & { color?: string }) {
  const matRef = useRef<ShaderMaterial>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  const fragment = useMemo(() => withTint(electricBoltFrag), []);
  const uniforms = useMemo(
    () => ({ uTime: { value: seed }, uColor: { value: new Color(color) }, ...tintUniforms(tint) }),
    [seed, color, tint],
  );
  useUTime(matRef);
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[radius * 2, radius * 2]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}

/** Mage Arcane Bolt — a violet electric orb (recolored by the weapon skin). */
export const ArcaneBoltEffect = ({ radius, tint }: ProjectileShaderProps) => (
  <ElectricBoltEffect color="#7330ff" radius={radius} tint={tint} />
);

// --- Energy Arrow: a bright four-point star/dart with shimmering sparkle. ----
// Colour-tunable so the archer's three shots read distinctly (poke / chill / pin).

const energyArrowFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  ${GLSL_NOISE}
  void main(){
    vec2 p = (vUv - 0.5) * 2.0;
    vec2 a = abs(p);
    // Diamond core with sharp axial spikes (reads as a glinting arrowhead).
    float diamond = 1.0 - (a.x + a.y);
    float spikes = pow(max(0.0, 1.0 - min(a.x, a.y) * 6.0), 2.0) * (1.0 - length(p));
    float star = pow(max(0.0, diamond), 1.3) + spikes * 0.7;
    float spark = pow(noise(vUv * 6.0 + uTime * 5.0), 3.0) * star;
    vec3 col = mix(uColor, vec3(1.0), star * 0.7);
    float alpha = smoothstep(0.0, 0.5, star + spark * 0.4);
    gl_FragColor = vec4(col * (1.0 + star * 2.5), alpha);
  }
`;

export function EnergyArrowEffect({
  color = '#9fe8ff',
  radius = 0.55,
  tint,
}: ProjectileShaderProps & { color?: string }) {
  const matRef = useRef<ShaderMaterial>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  const fragment = useMemo(() => withTint(energyArrowFrag), []);
  const uniforms = useMemo(
    () => ({ uTime: { value: seed }, uColor: { value: new Color(color) }, ...tintUniforms(tint) }),
    [seed, color, tint],
  );
  useUTime(matRef);
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[radius * 2, radius * 2]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}

// --- Energy Arrow PROJECTILE: a real arrow (glowing head + shaft) flying point-
// first, trailing a streaming enchant-colored energy ribbon. Oriented along the
// flight direction by the projectile entity, so it isn't a flat billboard. ------

const arrowTrailFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  ${GLSL_NOISE}
  void main(){
    float along = 1.0 - vUv.y;                    // 1 at the arrow → 0 at the tail
    float across = abs(vUv.x - 0.5) * 2.0;
    float body = smoothstep(0.0, 1.0, along) * smoothstep(1.0, 0.1, across);
    float flow = noise(vec2(vUv.x * 5.0, vUv.y * 9.0 + uTime * 8.0));
    float v = body * (0.35 + flow * 1.0);
    vec3 col = mix(uColor, vec3(1.0), v * 0.55);  // enchant color, white-hot core
    gl_FragColor = vec4(col * v * 2.4, v);
  }
`;

export function EnergyArrowProjectile({
  radius = 0.6,
  tint,
  heavy = false,
}: ProjectileShaderProps & { heavy?: boolean }) {
  const color = tint ?? '#dfe7f0';
  const matRef = useRef<ShaderMaterial>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  const uniforms = useMemo(
    () => ({ uTime: { value: seed }, uColor: { value: new Color(color) } }),
    [seed, color],
  );
  useUTime(matRef);
  const s = (heavy ? 1.35 : 1.0) * (radius / 0.6);
  const trailLen = heavy ? 1.9 : 1.4;
  return (
    <group scale={s}>
      {/* glowing arrowhead + shaft, pointing down the flight line (+Z) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.2]}>
        <coneGeometry args={[0.07, 0.32, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.5} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.12]}>
        <cylinderGeometry args={[0.025, 0.025, 0.5, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      {/* streaming enchant-colored energy trail (flat, additive) behind it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -trailLen / 2]}>
        <planeGeometry args={[0.34, trailLen]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={arrowTrailFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/** Archer Power Shot — a glowing energy arrow, enchant-colored. */
export const PowerShotEffect = ({ radius, tint }: ProjectileShaderProps) => (
  <EnergyArrowProjectile radius={radius} tint={tint} />
);
/** Archer Crippling Shot — a frigid blue dart (telegraphs the slow). */
export const CripplingShotEffect = ({ radius, tint }: ProjectileShaderProps) => (
  <EnergyArrowEffect color="#5fc8ff" radius={radius} tint={tint} />
);
/** Archer Pinning Arrow — a heavy enchant-colored energy arrow (telegraphs the root). */
export const PinningArrowEffect = ({ radius, tint }: ProjectileShaderProps) => (
  <EnergyArrowProjectile radius={radius} tint={tint} heavy />
);

// --- Holy Bolt: a radiant golden orb with a slowly turning cross flare. ------

const holyBoltFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float core = smoothstep(0.5, 0.0, r);
    // A four-armed cross flare that rotates gently.
    float rays = pow(max(0.0, cos(ang * 2.0 - uTime * 0.8)), 22.0);
    rays += pow(max(0.0, cos(ang * 2.0 - uTime * 0.8 + 1.5708)), 22.0);
    rays *= smoothstep(1.0, 0.1, r);
    float halo = smoothstep(0.9, 0.2, r) * (0.55 + 0.45 * sin(uTime * 5.0));
    float v = core + rays * 0.7 + halo * 0.25;
    vec3 col = mix(vec3(1.0, 0.82, 0.38), vec3(1.0, 1.0, 0.9), core + rays * 0.5);
    float a = smoothstep(0.03, 0.4, v) * (1.0 - smoothstep(0.92, 1.1, r));
    gl_FragColor = vec4(col * (1.0 + v * 2.2), a);
  }
`;

export function HolyBoltEffect({ radius = 0.6, tint }: ProjectileShaderProps) {
  const matRef = useRef<ShaderMaterial>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  const fragment = useMemo(() => withTint(holyBoltFrag), []);
  const uniforms = useMemo(() => ({ uTime: { value: seed }, ...tintUniforms(tint) }), [seed, tint]);
  useUTime(matRef);
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[radius * 2, radius * 2]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}
