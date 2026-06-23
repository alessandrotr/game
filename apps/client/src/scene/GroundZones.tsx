import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { GLSL_NOISE, UV_VERTEX } from '../render/shaders/common';

const ENABLE_3D_FLAMES = true; // Toggle this to false to easily revert back to flat 2D ground circle only

const molotov3DFireFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  ${GLSL_NOISE} // Reuses the project's hash, noise, and fbm utilities
  void main() {
    vec2 uv = vUv;
    // 1. Two scrolling vertical noise layers for dynamic lick motion around the cone
    vec2 noiseUv1 = vec2(uv.x * 4.0, uv.y - uTime * 2.0);
    vec2 noiseUv2 = vec2(uv.x * 8.0, uv.y - uTime * 3.5);
    float n1 = fbm(noiseUv1);
    float n2 = fbm(noiseUv2);
    float n = n1 * 0.6 + n2 * 0.4;
    
    // 2. Vertical flame plume (fades out at the top of the cone)
    float flame = (1.0 - uv.y) * (0.25 + 0.75 * n);
    
    // 3. Color ramp matching the circle: golden center -> rich red-orange -> dark crimson borders
    vec3 darkCrimson = vec3(0.38, 0.0, 0.05);
    vec3 redOrange = vec3(0.9, 0.22, 0.0);
    vec3 goldenYellow = vec3(1.0, 0.816, 0.149); // #ffd026
    vec3 col = mix(darkCrimson, redOrange, smoothstep(0.1, 0.4, flame));
    col = mix(col, goldenYellow, smoothstep(0.4, 0.8, flame));
    
    // 4. Subtle, light, transparent opacity (max alpha ~0.28)
    float alpha = flame * 0.28;
    gl_FragColor = vec4(col, alpha);
  }
`;

const molotovFireFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  ${GLSL_NOISE} // Reuses the project's hash, noise, and fbm utilities
  void main() {
    vec2 p = vUv - vec2(0.5); // Center coordinates (-0.5 to 0.5)
    float dist = length(p);
    // 1. Perfect circle boundary mask matching the damage radius
    float circleMask = smoothstep(0.5, 0.45, dist);
    // 2. Cartesian coordinates for noise movement (two opposing scroll layers)
    vec2 noiseUv1 = vUv * 3.5 - vec2(0.0, uTime * 1.5);
    vec2 noiseUv2 = vUv * 7.0 + vec2(uTime * 0.4, -uTime * 0.8);
    // 3. Distort the distance using FBM noise from both layers
    float n1 = fbm(noiseUv1);
    float n2 = fbm(noiseUv2);
    float n = n1 * 0.65 + n2 * 0.35;
    float flame = (1.0 - (dist * 2.0)) + n * 0.4;
    flame = clamp(flame, 0.0, 1.0) * circleMask;
    // 4. Color ramp: golden orange-yellow center -> rich red-orange -> dark crimson borders
    vec3 darkCrimson = vec3(0.38, 0.0, 0.05);
    vec3 redOrange = vec3(0.9, 0.22, 0.0);
    vec3 goldenYellow = vec3(1.0, 0.816, 0.149); // #ffd026
    vec3 fireColor = mix(darkCrimson, redOrange, smoothstep(0.1, 0.4, flame));
    fireColor = mix(fireColor, goldenYellow, smoothstep(0.4, 0.8, flame));
    // 5. Explicitly draw an outer thin dark red scorch ring to outline the boundary
    float scorchRing = smoothstep(0.49, 0.47, dist) * smoothstep(0.44, 0.46, dist);
    vec3 finalColor = mix(fireColor, vec3(0.5, 0.01, 0.005), scorchRing);
    float alpha = smoothstep(0.05, 0.25, flame) * 0.85;
    alpha = mix(alpha, 0.75, scorchRing) * circleMask;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Lingering ground effects — the molotov's burning puddle, singularity vortex, or flux core overcharge.
 * Rendered as flat, animated discs sized EXACTLY to the zone's radius.
 * The server owns the simulation; the client animates and renders.
 */
function GroundZoneEntity({ id }: { id: string }) {
  const groupRef = useRef<any>(null);
  const core = useRef<THREE.Mesh>(null);
  const swirl = useRef<THREE.Mesh>(null);
  const outerSwirl = useRef<THREE.Mesh>(null);
  const innerSwirl = useRef<THREE.Mesh>(null);
  const corona = useRef<THREE.Mesh>(null);
  const suction1 = useRef<THREE.Mesh>(null);
  const suction2 = useRef<THREE.Mesh>(null);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  const matRef3D = useRef<THREE.ShaderMaterial>(null);
  const uniforms3D = useMemo(() => ({ uTime: { value: 0 } }), []);

  const initial = useGameStore.getState().groundZones.get(id);

  useFrame((state, delta) => {
    const z = useGameStore.getState().groundZones.get(id);
    if (!z) return;
    const tEl = state.clock.elapsedTime;

    if (groupRef.current && initial && initial.radius > 0) {
      const scale = z.radius / initial.radius;
      groupRef.current.scale.set(scale, 1, scale);
    }

    if (matRef.current?.uniforms?.uTime) {
      matRef.current.uniforms.uTime.value += delta;
    }
    if (matRef3D.current?.uniforms?.uTime) {
      matRef3D.current.uniforms.uTime.value += delta;
    }

    if (z.kind === 'singularity') {
      // Swirling rotations
      if (outerSwirl.current) {
        outerSwirl.current.rotation.z = tEl * 0.4;
      }
      if (swirl.current) {
        swirl.current.rotation.z = tEl * 1.5;
      }
      if (innerSwirl.current) {
        innerSwirl.current.rotation.z = -tEl * 2.8;
      }
      if (core.current) {
        core.current.rotation.z = -tEl * 0.8;
        // Central black horizon pulsates
        const scale = 1.0 + Math.sin(tEl * 8) * 0.05;
        core.current.scale.set(scale, scale, 1);
      }
      if (corona.current) {
        // Glowing pink/purple border expands and contracts
        const scale = 1.0 + Math.sin(tEl * 8 + Math.PI) * 0.08;
        corona.current.scale.set(scale, scale, 1);
        corona.current.rotation.z = tEl * 2.2;
      }

      // Suction rings scaling down over time to simulate inward gravity pull
      if (suction1.current) {
        const progress = (tEl * 0.5) % 1.0;
        const scale = 1.0 - progress;
        suction1.current.scale.set(scale, scale, 1);
        (suction1.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * progress;
        suction1.current.rotation.z = tEl * 1.2;
      }
      if (suction2.current) {
        const progress = (tEl * 0.5 + 0.5) % 1.0;
        const scale = 1.0 - progress;
        suction2.current.scale.set(scale, scale, 1);
        (suction2.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * progress;
        suction2.current.rotation.z = tEl * 1.2 + Math.PI;
      }
    } else if (z.kind === 'buff_core') {
      // High-energy rapid pulsation
      if (core.current) {
        const pulse = 0.45 + Math.sin(tEl * 15) * 0.15 + Math.sin(tEl * 7) * 0.08;
        (core.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, Math.min(0.8, pulse));
        
        const scale = 0.95 + Math.sin(tEl * 12) * 0.04;
        core.current.scale.set(scale, scale, 1);
      }
    } else {
      // Default molotov fire flicker
      if (core.current) {
        const flicker = 0.55 + Math.sin(tEl * 11) * 0.12 + Math.sin(tEl * 5) * 0.08;
        (core.current.material as THREE.MeshBasicMaterial).opacity = flicker;
      }
    }
  });

  if (!initial) return null;
  const r = initial.radius;

  if (initial.kind === 'singularity') {
    return (
      <group position={[initial.x, 0, initial.z]}>
        {/* Outer Accretion Disk matching the doubled gravity pull radius (2 * r) */}
        <mesh ref={outerSwirl} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.6, r * 2.0, 48]} />
          <meshBasicMaterial color="#1e1b4b" transparent opacity={0.45} depthWrite={false} />
        </mesh>
        
        {/* Suction rings moving inward */}
        <mesh ref={suction1} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.5, r * 2.0, 32]} />
          <meshBasicMaterial color="#4c1d95" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh ref={suction2} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.5, r * 2.0, 32]} />
          <meshBasicMaterial color="#4c1d95" transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Outer dark purple gravity well base area */}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color="#2e1065" transparent opacity={0.65} depthWrite={false} />
        </mesh>
        {/* Swirling medium purple spiral/ring */}
        <mesh ref={swirl} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.4, r * 0.9, 40]} />
          <meshBasicMaterial color="#6b21a8" transparent opacity={0.7} depthWrite={false} />
        </mesh>
        {/* Inner fast purple ring */}
        <mesh ref={innerSwirl} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.35, r * 0.7, 40]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        {/* Glowing neon pink/magenta corona */}
        <mesh ref={corona} position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.42, r * 0.52, 40]} />
          <meshBasicMaterial color="#db2777" transparent opacity={0.75} depthWrite={false} />
        </mesh>
        {/* Center deep black event horizon core */}
        <mesh ref={core} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 0.45, 40]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.98} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  if (initial.kind === 'buff_core') {
    return (
      <group position={[initial.x, 0, initial.z]}>
        {/* Outer cyan energy boundary */}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color="#083344" transparent opacity={0.5} depthWrite={false} />
        </mesh>
        {/* Energy ring outline */}
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.2, r, 40]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        {/* Golden pulsing core */}
        <mesh ref={core} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 0.8, 40]} />
          <meshBasicMaterial color="#eab308" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Default: Molotov Fire
  return (
    <group ref={groupRef} position={[initial.x, 0, initial.z]}>
      {/* Ground flat circle shader */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[r * 2.0, r * 2.0]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={molotovFireFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* Short 3D flame cone shell focused towards the center */}
      {ENABLE_3D_FLAMES && (
        <mesh position={[0, 0.04 + 0.425, 0]}>
          <coneGeometry args={[r * 0.65, 0.85, 16, 1, true]} />
          <shaderMaterial
            ref={matRef3D}
            vertexShader={UV_VERTEX}
            fragmentShader={molotov3DFireFrag}
            uniforms={uniforms3D}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
          />
        </mesh>
      )}
    </group>
  );
}

/** Renders all active ground zones, mounting/unmounting on spawn/expire. */
export function GroundZones() {
  const ids = useGameStore((s) => s.groundZoneIds);
  return (
    <>
      {ids.map((id) => (
        <GroundZoneEntity key={id} id={id} />
      ))}
    </>
  );
}
