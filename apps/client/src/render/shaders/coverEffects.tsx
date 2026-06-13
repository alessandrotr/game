import { useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, NormalBlending, type ShaderMaterial } from 'three';
import { GLSL_NOISE, UV_VERTEX, useBurstClock, useUTime, type BurstShaderProps } from './common';

/**
 * Damage-state VFX for cars (the only destructible cover that burns + explodes).
 *
 * Smoke and fire are *looping* billboard plumes rendered as children of the car
 * while its HP sits in the matching band (smoke < 50%, fire < 20%) — they follow
 * the car and unmount when it leaves the band (or is destroyed). The explosion
 * is a *one-shot* burst spawned via the VFX layer when the server reports the car
 * detonated. All three are procedural (no textures), matching the ability shaders.
 */

// --- Smoke: a dark turbulent plume rising from the wreck (< 50% HP). ----------

const smokeFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    vec2 p = uv - vec2(0.5, 0.0);            // origin at bottom-center
    float rise = uTime * 0.5;
    float d = fbm(vec2(p.x * 4.0, uv.y * 3.0 - rise));
    // Plume mask: narrow at the base, widening with height, fading near the top.
    float width = mix(0.10, 0.42, uv.y);
    float column = smoothstep(width, 0.0, abs(p.x));
    float vert = smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.5, uv.y);
    float a = column * vert * (0.3 + 0.7 * d);
    vec3 col = mix(vec3(0.04), vec3(0.30), d);   // sooty grey, churning
    gl_FragColor = vec4(col, a * 0.85);
  }
`;

/** A looping smoke plume billboard, sized to the car. */
export function CarSmoke({ height = 1.7, radius = 1.6 }: { height?: number; radius?: number }) {
  const matRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: Math.random() * 10 } }), []);
  useUTime(matRef);
  const w = radius * 1.6;
  const h = height * 2.4;
  return (
    <Billboard position={[0, height + h * 0.35, 0]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={smokeFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={NormalBlending}
        />
      </mesh>
    </Billboard>
  );
}

// --- Fire: hot flames licking up from the car (< 20% HP). ---------------------

const fireFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    vec2 p = uv - vec2(0.5, 0.0);
    float rise = uTime * 1.5;
    float flame = fbm(vec2(p.x * 5.0, uv.y * 3.5 - rise));
    // Wide at the base, tapering to flickering tongues at the top.
    float width = mix(0.34, 0.04, uv.y);
    float column = smoothstep(width, 0.0, abs(p.x));
    float vert = smoothstep(0.0, 0.04, uv.y) * smoothstep(1.0, 0.2, uv.y);
    float v = column * vert * (0.45 + 0.55 * flame);
    // White-hot core → orange body → dark-red tips.
    vec3 col = mix(vec3(1.0, 0.92, 0.45), vec3(1.0, 0.34, 0.05), uv.y);
    col = mix(col, vec3(0.55, 0.04, 0.0), smoothstep(0.55, 1.0, uv.y));
    gl_FragColor = vec4(col * v * 2.2, v);
  }
`;

/** A looping flame billboard, sized to the car. */
export function CarFire({ height = 1.7, radius = 1.6 }: { height?: number; radius?: number }) {
  const matRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: Math.random() * 10 } }), []);
  useUTime(matRef);
  const w = radius * 1.7;
  const h = height * 1.7;
  return (
    <Billboard position={[0, height * 0.55 + h * 0.3, 0]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={fireFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}

// --- Explosion: a one-shot fireball + flash, over a ground scorch shock. -------

const explosionBallFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float grow = mix(0.15, 1.05, smoothstep(0.0, 0.45, uProgress));
    float turb = fbm(p * 5.0 + uTime * 3.0);
    float ball = smoothstep(grow, grow - 0.55, r) * (0.55 + 0.45 * turb);
    float flash = smoothstep(0.12, 0.0, uProgress) * smoothstep(0.6, 0.0, r);
    float fade = 1.0 - smoothstep(0.5, 1.0, uProgress);
    // White-hot center → orange → sooty edge.
    vec3 fire = mix(vec3(1.0, 0.95, 0.6), vec3(1.0, 0.3, 0.05), r);
    fire = mix(fire, vec3(0.18, 0.04, 0.02), smoothstep(0.62, 1.0, r));
    float v = (ball + flash) * fade;
    gl_FragColor = vec4(fire * v * 2.4, v);
  }
`;

const explosionRingFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float edge = uProgress * 1.0;
    float ring = smoothstep(0.14, 0.0, abs(r - edge));
    float grit = 0.6 + 0.4 * noise(p * 22.0 + uTime * 3.0);
    float v = ring * grit;
    vec3 col = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.35, 0.08), r);
    gl_FragColor = vec4(col * v * 2.0, v * (1.0 - uProgress));
  }
`;

/** The car detonation burst: an upward fireball with an expanding ground shock.
 *  `scale` shrinks the whole effect (the barrel reuses it at a smaller size). */
export function CarExplosionEffect({ durationMs, onComplete, scale = 1 }: BurstShaderProps & { scale?: number }) {
  const ball = useBurstClock(durationMs, onComplete);
  const ring = useBurstClock(durationMs, () => {}); // shares the lifetime; no-op completion
  const ballUniforms = useMemo(
    () => ({ uTime: { value: ball.seed }, uProgress: { value: 0 } }),
    [ball.seed],
  );
  const ringUniforms = useMemo(
    () => ({ uTime: { value: ring.seed }, uProgress: { value: 0 } }),
    [ring.seed],
  );
  return (
    <group scale={scale}>
      {/* Ground scorch shock */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <planeGeometry args={[12, 12]} />
        <shaderMaterial
          ref={ring.matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={explosionRingFrag}
          uniforms={ringUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Rising fireball */}
      <Billboard position={[0, 1.4, 0]}>
        <mesh>
          <planeGeometry args={[6, 6]} />
          <shaderMaterial
            ref={ball.matRef}
            vertexShader={UV_VERTEX}
            fragmentShader={explosionBallFrag}
            uniforms={ballUniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

/** Barrel detonation — the same shader as the car, scaled down (barrels are
 *  smaller props with a tighter blast). */
export function BarrelExplosionEffect(p: BurstShaderProps) {
  return <CarExplosionEffect {...p} scale={0.6} />;
}
