import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial, type ShaderMaterial } from 'three';
import { SINGULARITY_DURATION_MS } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { GLSL_NOISE, UV_VERTEX } from '../render/shaders/common';

/**
 * Lingering ground effects — the molotov's burning puddle, singularity vortex, or flux core overcharge.
 * Rendered as flat, animated discs sized EXACTLY to the zone's radius.
 * The server owns the simulation; the client animates and renders.
 */

// --- Singularity: a shader-driven black hole. A procedural accretion disc
//     (log-spiral arms, a hot photon ring, a true black event horizon) plus a
//     cheap GPU-points layer of matter spiralling inward. One second before it
//     detonates the whole field implodes — arms + particles rush the centre and
//     flare white — then the server's blast VFX takes over. Two shader draw
//     calls + one flat core: no textures, no per-frame CPU work per particle. --

const SINGULARITY_PARTICLES = 90;

const accretionFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uImplode;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;            // 0 centre → 1 at the pull radius
    float ang = atan(p.y, p.x);
    float h = 0.23;                        // event-horizon radius (normalized)
    // Log-spiral accretion arms swirling inward.
    float spiral = sin(ang * 2.0 + log(r + 0.05) * 7.0 - uTime * 3.0);
    float arms = smoothstep(0.1, 1.0, spiral);
    // Disc band from the horizon outward, fading to the edge.
    float disc = smoothstep(1.0, h, r) * smoothstep(h - 0.03, h + 0.05, r);
    float glow = arms * disc;
    // Photon ring: a hot bright rim hugging the event horizon.
    float rim = smoothstep(0.05, 0.0, abs(r - h));
    float shimmer = 0.75 + 0.25 * noise(p * 12.0 + uTime * 1.5);
    // Implosion: arms + rim flare and a core flash blooms over the final second.
    float flash = smoothstep(h + 0.15, 0.0, r) * uImplode;
    float v = (glow * 1.3 + rim * 1.7) * shimmer * (1.0 + uImplode * 2.5) + flash * 2.0;
    vec3 outer = vec3(0.32, 0.05, 0.60);   // deep purple
    vec3 mid = vec3(0.90, 0.18, 0.78);     // magenta
    vec3 hot = vec3(0.65, 0.97, 1.00);     // cyan-white
    vec3 col = mix(outer, mid, smoothstep(0.7, h, r));
    col = mix(col, hot, clamp(rim + flash, 0.0, 1.0));
    gl_FragColor = vec4(col * v * 1.6, clamp(v, 0.0, 1.0));
  }
`;

const particleVert = /* glsl */ `
  uniform float uTime, uImplode, uRadius;
  attribute float aSeed;
  attribute float aAng;
  attribute float aR0;
  varying float vLife;
  void main(){
    float speed = 0.18 + aSeed * 0.22;
    float life = fract(uTime * speed + aSeed);     // 0 outer → 1 consumed at the core
    life = clamp(life + uImplode * 0.7, 0.0, 1.0); // implosion yanks everything in
    float rr = mix(aR0, 0.0, life) * (1.0 - uImplode * 0.25);
    float ang = aAng + (1.0 - rr) * 9.0 + uTime * 0.6; // tighter spin near the centre
    vec3 pos = vec3(cos(ang) * rr * uRadius, sin(ang) * rr * uRadius, 0.0);
    vLife = life;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = mix(2.5, 7.0, aSeed) * (1.0 + uImplode * 2.5);
    gl_PointSize = size * (260.0 / max(1.0, -mv.z));
  }
`;

const particleFrag = /* glsl */ `
  precision highp float;
  varying float vLife;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 col = mix(vec3(0.70, 0.30, 1.0), vec3(0.70, 0.97, 1.0), vLife); // purple → cyan-white
    float a = soft * (0.25 + vLife * 0.75);
    gl_FragColor = vec4(col * (1.0 + vLife * 2.0), a);
  }
`;

function SingularityZone({ x, z, radius }: { x: number; z: number; radius: number }) {
  const accretionMat = useRef<ShaderMaterial>(null);
  const particleMat = useRef<ShaderMaterial>(null);
  const core = useRef<Mesh>(null);
  const start = useRef<number | null>(null);

  // Stable per-particle attributes (seed/angle/start-radius) + a dummy position
  // buffer (the vertex shader derives the real position from the attributes).
  const buffers = useMemo(() => {
    const seeds = new Float32Array(SINGULARITY_PARTICLES);
    const angs = new Float32Array(SINGULARITY_PARTICLES);
    const r0s = new Float32Array(SINGULARITY_PARTICLES);
    const positions = new Float32Array(SINGULARITY_PARTICLES * 3);
    for (let i = 0; i < SINGULARITY_PARTICLES; i++) {
      seeds[i] = Math.random();
      angs[i] = Math.random() * Math.PI * 2;
      r0s[i] = 0.3 + Math.random() * 0.7; // start out in the accretion disc
    }
    return { seeds, angs, r0s, positions };
  }, []);

  const accretionUniforms = useMemo(() => ({ uTime: { value: 0 }, uImplode: { value: 0 } }), []);
  const particleUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uImplode: { value: 0 }, uRadius: { value: radius * 2 } }),
    [radius],
  );

  useFrame((state) => {
    const tEl = state.clock.elapsedTime;
    if (start.current === null) start.current = tEl;
    const elapsed = tEl - start.current;
    const total = SINGULARITY_DURATION_MS / 1000;
    // Implosion ramps 0→1 over the final second before the explosion.
    const implode = Math.max(0, Math.min(1, elapsed - (total - 1)));
    const au = accretionMat.current?.uniforms;
    if (au) {
      if (au.uTime) au.uTime.value = tEl;
      if (au.uImplode) au.uImplode.value = implode;
    }
    const pu = particleMat.current?.uniforms;
    if (pu) {
      if (pu.uTime) pu.uTime.value = tEl;
      if (pu.uImplode) pu.uImplode.value = implode;
    }
    if (core.current) {
      // The event horizon pulses, then collapses to a point as it implodes.
      const s = (1 + Math.sin(tEl * 8) * 0.05) * (1 - implode);
      core.current.scale.set(s, s, 1);
    }
  });

  const accDiameter = radius * 4; // the plane spans 2 × the pull radius (= 2r)

  return (
    <group position={[x, 0, z]}>
      {/* Procedural accretion disc. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[accDiameter, accDiameter]} />
        <shaderMaterial
          ref={accretionMat}
          vertexShader={UV_VERTEX}
          fragmentShader={accretionFrag}
          uniforms={accretionUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* True black event horizon (normal-blended so it reads as a void). */}
      <mesh ref={core} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.45, 40]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.98} depthWrite={false} />
      </mesh>

      {/* Infalling matter (cheap GPU points spiralling into the core). */}
      <points position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 1]} />
          <bufferAttribute attach="attributes-aAng" args={[buffers.angs, 1]} />
          <bufferAttribute attach="attributes-aR0" args={[buffers.r0s, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={particleMat}
          vertexShader={particleVert}
          fragmentShader={particleFrag}
          uniforms={particleUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}

// --- Fire field (molotov puddle / death-trap inferno): a single flat disc with
//     a procedural fire shader — orange-red tongues that crawl and lick across
//     the area, soft-faded at the radius to mark the damage zone. One draw call,
//     no textures or lights. The group scales with the zone's live radius, so the
//     death trap's expanding ring grows the fire. -------------------------------

// Magma pool: a dark volcanic crust cracked by glowing molten veins, with hot
// spots that bubble (swell + pop). A slow domain-warped fbm gives the viscous
// churn; a higher-frequency pulsing field is the bubbling. Clean circular edge
// blooms to the exact radius. Normal-blended so the dark crust reads.
const fireFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uGrow;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;            // 0 centre → 1 edge
    float t = uTime;

    // Clean circular pool edge that blooms out to the exact radius.
    float edge = uGrow;
    float boundary = 1.0 - smoothstep(edge - 0.015, edge, r);
    if (boundary < 0.01) discard;

    // Slow viscous churn: domain-warped fbm drives the molten field.
    vec2 q = p * 3.0;
    vec2 warp = vec2(fbm(q + t * 0.13), fbm(q + vec2(5.2, 1.3) - t * 0.11));
    float molten = fbm(q + warp * 1.6);

    // Bubbles: higher-frequency blobs whose brightness pulses (swell then pop).
    float bf = fbm(p * 7.0 + warp);
    float pulse = 0.5 + 0.5 * sin(t * 2.0 + bf * 16.0);
    float bubbles = smoothstep(0.66, 0.92, bf + pulse * 0.14);

    // Hot molten cracks vs. cooler crust, plus the bubbling hot spots. A modest
    // ambient floor keeps it readable without glowing like a beacon.
    float heat = clamp(0.18 + smoothstep(0.25, 0.6, molten) + bubbles * 0.6, 0.0, 1.4);

    // Soft molten rim marking the exact radius.
    float rim = smoothstep(0.05, 0.0, abs(r - edge + 0.02)) * step(0.05, edge);

    // Muted crust → red → orange, with warm (not white-hot) bubbles.
    vec3 crust = vec3(0.34, 0.06, 0.02);
    vec3 deep = vec3(0.6, 0.10, 0.0);
    vec3 orange = vec3(0.95, 0.4, 0.05);
    vec3 hot = vec3(1.0, 0.62, 0.2);
    vec3 col = mix(crust, deep, smoothstep(0.15, 0.55, heat));
    col = mix(col, orange, smoothstep(0.55, 0.95, heat));
    col = mix(col, hot, clamp(smoothstep(1.0, 1.35, heat) + bubbles * 0.4, 0.0, 1.0));
    col = mix(col, vec3(0.95, 0.45, 0.12), rim * 0.6);

    // Lava surface, slightly translucent so it sits on the ground rather than glowing.
    float a = boundary * (0.7 + 0.2 * heat);
    a = max(a, rim * 0.7 * boundary);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function FireZone({ id, x, z, radius }: { id: string; x: number; z: number; radius: number }) {
  const groupRef = useRef<Group>(null);
  const mat = useRef<ShaderMaterial>(null);
  const start = useRef<number | null>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGrow: { value: 0 } }), []);

  useFrame((state) => {
    const tEl = state.clock.elapsedTime;
    const u = mat.current?.uniforms;
    if (u) {
      if (start.current === null) start.current = tEl;
      if (u.uTime) u.uTime.value = tEl;
      // Bloom the flame rim out to the radius over ~0.7s when it ignites.
      if (u.uGrow) u.uGrow.value = Math.min(1, (tEl - start.current) / 0.7);
    }
    const zone = useGameStore.getState().groundZones.get(id);
    if (!zone || !groupRef.current || radius <= 0) return;
    // The death-trap fire keeps expanding its radius — track the live value.
    const s = zone.radius / radius;
    groupRef.current.scale.set(s, 1, s);
  });

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 64]} />
        <shaderMaterial
          ref={mat}
          vertexShader={UV_VERTEX}
          fragmentShader={fireFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function GroundZoneEntity({ id }: { id: string }) {
  const core = useRef<Mesh>(null);
  const initial = useGameStore.getState().groundZones.get(id);

  useFrame((state) => {
    const z = useGameStore.getState().groundZones.get(id);
    if (!z || z.kind !== 'buff_core') return;
    // Buff core: high-energy rapid pulsation.
    if (core.current) {
      const tEl = state.clock.elapsedTime;
      const pulse = 0.45 + Math.sin(tEl * 15) * 0.15 + Math.sin(tEl * 7) * 0.08;
      (core.current.material as MeshBasicMaterial).opacity = Math.max(0.2, Math.min(0.8, pulse));
      const scale = 0.95 + Math.sin(tEl * 12) * 0.04;
      core.current.scale.set(scale, scale, 1);
    }
  });

  if (!initial) return null;
  const r = initial.radius;

  if (initial.kind === 'singularity') {
    return <SingularityZone x={initial.x} z={initial.z} radius={r} />;
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

  // Default: molotov puddle / death-trap fire — a burning, flame-filled area.
  return <FireZone id={id} x={initial.x} z={initial.z} radius={r} />;
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
