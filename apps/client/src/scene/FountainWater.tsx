import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Vector2,
  type ShaderMaterial,
} from 'three';
import { useQualityStore } from '../store/useQualityStore';
import { LOBBY_FOUNTAIN } from './lobbyLayout';
import { usePointScale } from './usePointScale';

/**
 * The town fountain's WATER. The stone is part of the baked lobby model
 * (`tools/lobby/world_a.py → build_fountain`); a static mesh can't animate water, so every
 * liquid surface lives here as a live shader, laid over the stonework:
 *
 *   • three surfaces (basin, tier-1 bowl, tier-2 bowl) with layered swells, concentric ripples
 *     where the streams land, lion-spout impact rings, foam, caustics, dusk-sky + sun
 *     reflection, fresnel, and a pulsing blue wash from the crystal finial;
 *   • flowing curtains over both bowl lips + four arcing lion-head spouts — ribbon meshes
 *     whose streaks scroll down the fall line;
 *   • spray droplets riding the same parabolas, splash/mist where the water lands.
 *
 * Everything is GPU-driven (one shared time uniform) — no per-frame CPU work beyond that.
 * Geometry is parametrised by LOBBY_FOUNTAIN, generated from the Blender model, so the water
 * always matches the stone.
 */

const F = LOBBY_FOUNTAIN;

// ----------------------------------------------------------------------------- stream layout
interface Stream {
  /** angle around the fountain axis (radians, game xz-plane) */
  a: number;
  r0: number;
  y0: number;
  r1: number;
  y1: number;
  /** ribbon width at the source */
  w: number;
  seed: number;
}

function curtain(
  count: number,
  r0: number,
  y0: number,
  r1: number,
  y1: number,
  w: number,
  seedBase: number,
): Stream[] {
  return Array.from({ length: count }, (_, i) => ({
    a: (i / count) * Math.PI * 2 + (i % 2) * 0.02,
    r0,
    y0,
    r1: r1 + 0.12 * Math.sin(i * 3.1),
    y1,
    w,
    seed: seedBase + i * 0.137,
  }));
}

function buildStreams(): { curtains1: Stream[]; curtains2: Stream[]; spouts: Stream[] } {
  const curtains1 = curtain(26, 3.0, 4.3, 3.35, F.basinY, 0.3, 1);
  const curtains2 = curtain(18, 1.7, 5.9, 2.0, F.tier1Y, 0.2, 40);
  const spouts: Stream[] = F.spouts.map(([x, z], i) => {
    const dx = x - F.center[0];
    const dz = z - F.center[1];
    return {
      a: Math.atan2(dz, dx),
      r0: Math.hypot(dx, dz) + 0.05,
      y0: 1.92,
      r1: 2.0,
      y1: F.basinY,
      w: 0.17,
      seed: 80 + i * 1.3,
    };
  });
  return { curtains1, curtains2, spouts };
}

/** Position on a stream's parabola (t in 0..1): outward/inward drift is linear, the drop is free fall (∝ t²). */
function arc(s: Stream, t: number, out: [number, number, number]) {
  const r = s.r0 + (s.r1 - s.r0) * t;
  out[0] = Math.cos(s.a) * r;
  out[1] = s.y0 - (s.y0 - s.y1) * t * t;
  out[2] = Math.sin(s.a) * r;
}

// ----------------------------------------------------------------------------- shaders
const SURFACE_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SURFACE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec2 uCenter;
  uniform float uRing;       // radius where falling streams land (0 = none)
  uniform float uRingAmp;
  uniform float uSpoutAmp;
  uniform vec2 uSpouts[4];
  uniform float uGlow;       // crystal wash strength
  uniform float uFoam;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // radial ripple from point c: accumulates height h and its gradient g
  void ripple(vec2 p, vec2 c, float k, float spd, float decay, float amp, inout float h, inout vec2 g) {
    vec2 d = p - c;
    float r = max(length(d), 1e-3);
    float ph = r * k - uTime * spd;
    float env = amp * exp(-r * decay);
    float s = sin(ph);
    h += env * s;
    g += (d / r) * env * (k * cos(ph) - decay * s);
  }

  void main() {
    vec2 p = vWorld.xz - uCenter;
    float h = 0.0;
    vec2 g = vec2(0.0);

    // ambient swell: three crossing wave trains
    vec2 d1 = normalize(vec2(1.0, 0.6));
    float a1 = dot(d1, p) * 2.1 + uTime * 0.9;
    h += 0.020 * sin(a1); g += d1 * 0.020 * 2.1 * cos(a1);
    vec2 d2 = normalize(vec2(-0.7, 1.0));
    float a2 = dot(d2, p) * 3.4 - uTime * 1.25;
    h += 0.014 * sin(a2); g += d2 * 0.014 * 3.4 * cos(a2);
    vec2 d3 = normalize(vec2(0.3, -1.0));
    float a3 = dot(d3, p) * 6.1 + uTime * 1.8;
    h += 0.008 * sin(a3); g += d3 * 0.008 * 6.1 * cos(a3);

    float r = length(p);
    // concentric ripples radiating from where the curtains hit the water
    if (uRing > 0.0) {
      float dr = r - uRing;
      vec2 dir = p / max(r, 1e-3);
      float ph = dr * 7.5 - uTime * 3.4;
      float env = uRingAmp * exp(-abs(dr) * 0.75);
      float s = sin(ph);
      h += env * s;
      g += dir * env * (7.5 * cos(ph) - 0.75 * sign(dr) * s);
    }
    // lion-spout impacts
    for (int i = 0; i < 4; i++) ripple(p, uSpouts[i], 10.0, 4.4, 1.2, uSpoutAmp, h, g);

    vec3 n = normalize(vec3(-g.x * 7.0, 1.0, -g.y * 7.0));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    vec3 R = reflect(-V, n);

    // dusk sky reflection + a warm sun glint
    vec3 sky = mix(vec3(0.66, 0.52, 0.62), vec3(0.20, 0.26, 0.52), clamp(R.y * 1.5, 0.0, 1.0));
    vec3 sun = normalize(vec3(0.55, 0.30, 0.32));
    float sd = max(dot(R, sun), 0.0);
    float spec = pow(sd, 110.0) * 2.0 + pow(sd, 14.0) * 0.14;

    // body colour: deep teal, lighter on ripple crests, drifting caustic net, crystal wash
    vec3 body = mix(vec3(0.015, 0.14, 0.22), vec3(0.07, 0.42, 0.52), clamp(0.45 + h * 9.0, 0.0, 1.0));
    float c1 = sin(p.x * 3.7 + uTime * 0.8 + vnoise(p * 2.0) * 4.0) + sin(p.y * 4.1 - uTime * 0.7 + vnoise(p * 2.3 + 9.0) * 4.0);
    body += vec3(0.22, 0.55, 0.62) * pow(max(0.0, 1.0 - abs(c1) * 0.6), 4.0) * 0.4;
    body += vec3(0.10, 0.30, 0.62) * uGlow * (0.55 + 0.45 * sin(uTime * 1.3));

    // foam where water lands
    float foam = 0.0;
    if (uRing > 0.0) foam += (1.0 - smoothstep(0.0, 0.5, abs(r - uRing))) * (0.35 + 0.65 * vnoise(p * 7.0 + uTime * 0.9));
    for (int i = 0; i < 4; i++) foam += (1.0 - smoothstep(0.0, 0.55, length(p - uSpouts[i]))) * uSpoutAmp * 40.0 * (0.3 + 0.7 * vnoise(p * 9.0 - uTime));
    foam = clamp(foam, 0.0, 1.0) * uFoam;

    vec3 col = mix(body, sky, fres * 0.85) + spec * vec3(1.0, 0.86, 0.7) + foam * vec3(0.9, 0.97, 1.0);
    float alpha = clamp(mix(0.82, 0.97, fres) + foam * 0.2, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const RIBBON_VERT = /* glsl */ `
  attribute float aU;
  attribute float aT;
  attribute float aSeed;
  varying float vU;
  varying float vT;
  varying float vSeed;
  void main() {
    vU = aU; vT = aT; vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  varying float vU;
  varying float vT;
  varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    // streaks scroll down the fall line; two octaves so the flow isn't a single tiled stripe
    float flow = vT * 6.0 - uTime * uSpeed + vSeed * 9.0;
    float n = vnoise(vec2(vU * 2.4 + vSeed * 5.0, flow)) * 0.65 + vnoise(vec2(vU * 5.5 - vSeed, flow * 2.3)) * 0.35;
    float core = 1.0 - smoothstep(0.25, 1.0, abs(vU));
    float a = core * (0.45 + 0.75 * n) * smoothstep(0.0, 0.05, vT) * (1.0 - 0.35 * smoothstep(0.85, 1.0, vT));
    vec3 col = mix(vec3(0.42, 0.72, 0.9), vec3(1.0), n * 0.85);
    gl_FragColor = vec4(col * a, a);
  }
`;

const DROP_VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aOff;
  attribute vec2 aPS;       // x = phase, y = speed
  attribute float aSize;
  uniform float uTime;
  uniform float uScale;
  varying float vA;
  void main() {
    float t = fract(uTime * aPS.y + aPS.x);
    vec3 p = vec3(mix(aStart.x, aEnd.x, t), aStart.y - (aStart.y - aEnd.y) * t * t, mix(aStart.z, aEnd.z, t));
    p += aOff * t;                                   // spread as it falls
    vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.88, 1.0, t));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 40.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPLASH_VERT = /* glsl */ `
  attribute vec3 aEnd;
  attribute vec3 aOff;
  attribute vec2 aPS;
  attribute float aSize;
  uniform float uTime;
  uniform float uScale;
  varying float vA;
  void main() {
    float life = fract(uTime * aPS.y + aPS.x);
    vec3 p = aEnd + vec3(aOff.x * life, sin(life * 3.14159) * aOff.y, aOff.z * life);
    vA = (1.0 - life) * smoothstep(0.0, 0.1, life);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(aSize * (0.5 + life * 1.8) * uScale / max(0.1, -mv.z), 1.0, 120.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SOFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGain;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.7) * vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * a * uGain, a);
  }
`;

// ----------------------------------------------------------------------------- geometry
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildRibbons(streams: Stream[], segs = 16): BufferGeometry {
  const rows = segs + 1;
  const n = streams.length;
  const pos = new Float32Array(n * rows * 2 * 3);
  const aU = new Float32Array(n * rows * 2);
  const aT = new Float32Array(n * rows * 2);
  const aSeed = new Float32Array(n * rows * 2);
  const idx: number[] = [];
  const p: [number, number, number] = [0, 0, 0];
  streams.forEach((s, i) => {
    const tx = -Math.sin(s.a);
    const tz = Math.cos(s.a);
    for (let j = 0; j < rows; j++) {
      const t = j / segs;
      arc(s, t, p);
      const half = (s.w * (1 - 0.3 * t) + 0.03) / 2;
      for (let side = 0; side < 2; side++) {
        const k = (i * rows + j) * 2 + side;
        const sg = side === 0 ? -1 : 1;
        pos[k * 3] = p[0] + tx * half * sg;
        pos[k * 3 + 1] = p[1];
        pos[k * 3 + 2] = p[2] + tz * half * sg;
        aU[k] = sg;
        aT[k] = t;
        aSeed[k] = s.seed;
      }
      if (j < segs) {
        const a = (i * rows + j) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aU', new BufferAttribute(aU, 1));
  g.setAttribute('aT', new BufferAttribute(aT, 1));
  g.setAttribute('aSeed', new BufferAttribute(aSeed, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function buildDrops(
  streams: Stream[],
  perStream: number,
  seed: number,
  spread: number,
): BufferGeometry {
  const n = streams.length * perStream;
  const start = new Float32Array(n * 3);
  const end = new Float32Array(n * 3);
  const off = new Float32Array(n * 3);
  const ps = new Float32Array(n * 2);
  const size = new Float32Array(n);
  const rnd = seeded(seed);
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 0, 0];
  streams.forEach((s, i) => {
    arc(s, 0, a);
    arc(s, 1, b);
    for (let k = 0; k < perStream; k++) {
      const j = i * perStream + k;
      start.set(a, j * 3);
      end.set(b, j * 3);
      off.set([(rnd() - 0.5) * spread, 0, (rnd() - 0.5) * spread], j * 3);
      ps[j * 2] = rnd();
      ps[j * 2 + 1] = 0.9 + rnd() * 0.5;
      size[j] = 0.05 + rnd() * 0.06;
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(start, 3));
  g.setAttribute('aStart', new BufferAttribute(start, 3));
  g.setAttribute('aEnd', new BufferAttribute(end, 3));
  g.setAttribute('aOff', new BufferAttribute(off, 3));
  g.setAttribute('aPS', new BufferAttribute(ps, 2));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius = 12;
  return g;
}

function buildSplashes(
  streams: Stream[],
  perStream: number,
  seed: number,
  size0: number,
  rise: number,
): BufferGeometry {
  const n = streams.length * perStream;
  const end = new Float32Array(n * 3);
  const off = new Float32Array(n * 3);
  const ps = new Float32Array(n * 2);
  const size = new Float32Array(n);
  const rnd = seeded(seed);
  const b: [number, number, number] = [0, 0, 0];
  streams.forEach((s, i) => {
    arc(s, 1, b);
    for (let k = 0; k < perStream; k++) {
      const j = i * perStream + k;
      end.set([b[0], b[1] + 0.02, b[2]], j * 3);
      off.set([(rnd() - 0.5) * 0.9, rise * (0.5 + rnd()), (rnd() - 0.5) * 0.9], j * 3);
      ps[j * 2] = rnd();
      ps[j * 2 + 1] = 0.55 + rnd() * 0.5;
      size[j] = size0 * (0.7 + rnd() * 0.6);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(end, 3));
  g.setAttribute('aEnd', new BufferAttribute(end, 3));
  g.setAttribute('aOff', new BufferAttribute(off, 3));
  g.setAttribute('aPS', new BufferAttribute(ps, 2));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius = 12;
  return g;
}

// ----------------------------------------------------------------------------- components
type Uniforms = Record<string, { value: unknown }>;

const C_DROP: [number, number, number] = [0.8, 0.93, 1];
const C_SPLASH: [number, number, number] = [0.85, 0.95, 1];
const C_MIST: [number, number, number] = [0.6, 0.78, 0.95];

function Surface({
  y,
  radius,
  segments,
  time,
  ring,
  ringAmp,
  spoutAmp,
  glow,
  foam,
}: {
  y: number;
  radius: number;
  segments: number;
  time: { value: number };
  ring: number;
  ringAmp: number;
  spoutAmp: number;
  glow: number;
  foam: number;
}) {
  const uniforms = useMemo<Uniforms>(
    () => ({
      uTime: time,
      uCenter: { value: new Vector2(F.center[0], F.center[1]) },
      uRing: { value: ring },
      uRingAmp: { value: ringAmp },
      uSpoutAmp: { value: spoutAmp },
      uSpouts: { value: F.spouts.map(([x, z]) => new Vector2(x, z)) },
      uGlow: { value: glow },
      uFoam: { value: foam },
    }),
    [time, ring, ringAmp, spoutAmp, glow, foam],
  );
  return (
    <mesh position={[F.center[0], y, F.center[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
      <circleGeometry args={[radius, segments]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={SURFACE_VERT}
        fragmentShader={SURFACE_FRAG}
      />
    </mesh>
  );
}

function Ribbons({
  streams,
  time,
  speed,
}: {
  streams: Stream[];
  time: { value: number };
  speed: number;
}) {
  const geo = useMemo(() => buildRibbons(streams), [streams]);
  useEffect(() => () => geo.dispose(), [geo]);
  const uniforms = useMemo<Uniforms>(
    () => ({ uTime: time, uSpeed: { value: speed } }),
    [time, speed],
  );
  return (
    <mesh geometry={geo} frustumCulled={false} renderOrder={4}>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
        uniforms={uniforms}
        vertexShader={RIBBON_VERT}
        fragmentShader={RIBBON_FRAG}
      />
    </mesh>
  );
}

function Particles({
  geometry,
  vertex,
  time,
  color,
  gain,
}: {
  geometry: BufferGeometry;
  vertex: string;
  time: { value: number };
  color: [number, number, number];
  gain: number;
}) {
  const mat = useRef<ShaderMaterial>(null);
  usePointScale(mat);
  const uniforms = useMemo<Uniforms>(
    () => ({
      uTime: time,
      uScale: { value: 800 },
      uColor: { value: color },
      uGain: { value: gain },
    }),
    [time, color, gain],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={5}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={SOFT_FRAG}
      />
    </points>
  );
}

export function FountainWater() {
  const tier = useQualityStore((s) => s.tier);
  const time = useMemo(() => ({ value: 0 }), []);
  useFrame((s) => {
    time.value = s.clock.elapsedTime;
  });

  const { curtains1, curtains2, spouts } = useMemo(buildStreams, []);
  const all = useMemo(
    () => [...curtains1, ...curtains2, ...spouts],
    [curtains1, curtains2, spouts],
  );
  const high = tier !== 'low';

  const drops = useMemo(
    () => (high ? buildDrops(all, tier === 'high' ? 9 : 5, 11, 0.5) : null),
    [all, high, tier],
  );
  const splashes = useMemo(
    () => (high ? buildSplashes(all, 3, 23, 0.55, 0.28) : null),
    [all, high],
  );
  const mist = useMemo(
    () => (high ? buildSplashes([...curtains1, ...spouts], 2, 37, 1.5, 0.7) : null),
    [curtains1, spouts, high],
  );

  return (
    <group>
      {/* surfaces: basin gets the ripple ring + spout impacts; bowls get a softer ring */}
      <Surface
        y={F.basinY}
        radius={F.basinR}
        segments={8}
        time={time}
        ring={3.35}
        ringAmp={0.03}
        spoutAmp={0.02}
        glow={0.5}
        foam={1}
      />
      <Surface
        y={F.tier1Y}
        radius={F.tier1R}
        segments={48}
        time={time}
        ring={2.0}
        ringAmp={0.022}
        spoutAmp={0}
        glow={0.9}
        foam={0.8}
      />
      <Surface
        y={F.tier2Y}
        radius={F.tier2R}
        segments={40}
        time={time}
        ring={0}
        ringAmp={0}
        spoutAmp={0}
        glow={1.3}
        foam={0}
      />

      {/* stream + particle geometry is authored around the fountain's own axis */}
      <group position={[F.center[0], 0, F.center[1]]}>
        <Ribbons streams={curtains1} time={time} speed={2.6} />
        <Ribbons streams={curtains2} time={time} speed={2.2} />
        <Ribbons streams={spouts} time={time} speed={3.4} />

        {drops && (
          <Particles geometry={drops} vertex={DROP_VERT} time={time} color={C_DROP} gain={1.4} />
        )}
        {splashes && (
          <Particles
            geometry={splashes}
            vertex={SPLASH_VERT}
            time={time}
            color={C_SPLASH}
            gain={0.9}
          />
        )}
        {mist && (
          <Particles geometry={mist} vertex={SPLASH_VERT} time={time} color={C_MIST} gain={0.28} />
        )}
      </group>
    </group>
  );
}
