import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, DoubleSide, NormalBlending, type Blending } from 'three';
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
  blending = AdditiveBlending,
}: BurstShaderProps & { width: number; height: number; frag: string; y?: number; blending?: Blending }) {
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
          blending={blending}
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

export const ArcaneBlastEffect = ({ durationMs, onComplete }: BurstShaderProps) => {
  const { matRef, seed } = useBurstClock(durationMs, onComplete);
  const uniforms = useMemo(() => ({ uTime: { value: seed }, uProgress: { value: 0 } }), [seed]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
      <planeGeometry args={[9, 9]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={UV_VERTEX}
        fragmentShader={arcaneBlastFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
};

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
// Sized so the shockwave ring (which expands to r=0.95 of the quad's half-width)
// lands exactly on Ground Slam's 5-unit damage radius: 5 / 0.475 ≈ 10.5.
export const GroundSlamEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={10.5} frag={groundSlamFrag} />;

// --- Cleave: a steel blade-trail that sweeps the 180° arc in FRONT of the player.

const cleaveFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  void main(){
    const float TAU = 6.28318530718;
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;                        // 0 centre → 1 edge
    // Signed angle from "forward", in turns: 0 = front, ±0.25 = the sides,
    // ±0.5 = directly behind. (−p.y points toward the cast direction once the
    // quad is laid flat and yaw-oriented, so the arc sits IN FRONT.)
    float front = atan(p.x, -p.y) / TAU;              // -0.5 .. 0.5
    // Only the 180° arc ahead (|front| <= 0.25), with a soft edge.
    float inFront = smoothstep(0.27, 0.24, abs(front));
    // The blade tip sweeps across the front arc, one side to the other.
    float tipPos = -0.25 + uProgress * 0.5;
    float delta = tipPos - front;                     // >=0 → already carved
    float swept = step(0.0, delta);
    // The arc band the sword carves.
    float band = smoothstep(0.30, 0.0, abs(r - 0.78));
    // Comet trail: brightest at the tip, fading back along the swept arc.
    float trail = swept * smoothstep(0.5, 0.0, delta);
    // Hot leading edge — the steel glint at the blade tip.
    float tip = smoothstep(0.05, 0.0, abs(delta)) * swept;
    // Faint reach line across the whole front arc.
    float ring = band * 0.10;
    float v = (band * (trail * 0.7 + tip * 1.9) + ring) * inFront;
    vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.97, 0.9), clamp(tip + trail * 0.3, 0.0, 1.0));
    // Hold, then fade out over the last third of the lifetime.
    float life = 1.0 - smoothstep(0.65, 1.0, uProgress);
    gl_FragColor = vec4(col * v * 2.6, v * life);
  }
`;
export const CleaveEffect = (p: BurstShaderProps) => <GroundBurst {...p} size={8} frag={cleaveFrag} />;

// --- Smash: a Syndra-style dark sphere — a violet energy orb that materializes
//     in front, crackles with arcane filaments, then disperses in a shockwave. --

const smashFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;            // 0 centre → 1 edge
    float ang = atan(p.y, p.x);

    // Materialize fast, hold, then scatter + fade over the back half.
    float grow = smoothstep(0.0, 0.30, uProgress);
    float fade = 1.0 - smoothstep(0.55, 1.0, uProgress);
    float rs = 0.46 * grow;               // orb radius

    // Glowing violet shell of the dark sphere (bright rim, hollow void core —
    // the dark centre reads as transparent under additive blending).
    float shell = smoothstep(0.12, 0.0, abs(r - rs)) * step(r, rs + 0.12);
    // Swirling arcane filaments coiling around the orb.
    float swirl = noise(vec2(ang * 2.0 + uTime * 3.0, r * 6.0 - uTime * 4.0));
    float arcs = pow(max(0.0, sin(ang * 7.0 + uTime * 7.0 + swirl * 6.2)), 6.0)
                 * smoothstep(rs + 0.30, rs - 0.04, r) * smoothstep(0.10, rs, r);
    // Hot implosion flash at the moment it forms.
    float core = smoothstep(rs, 0.0, r) * (1.0 - smoothstep(0.0, 0.32, uProgress)) * 0.7;
    // Dispersal shockwave scattering outward as the orb breaks.
    float ringEdge = mix(rs, 1.0, smoothstep(0.25, 1.0, uProgress));
    float ring = smoothstep(0.07, 0.0, abs(r - ringEdge)) * smoothstep(0.45, 1.0, uProgress);

    float v = shell * 1.7 + arcs * 1.2 + core + ring * 1.3;
    vec3 violet = vec3(0.42, 0.13, 0.96);             // deep arcane purple
    vec3 hot = vec3(0.98, 0.62, 1.0);                 // magenta-white highlight
    vec3 col = mix(violet, hot, clamp(shell + arcs + core, 0.0, 1.0));
    gl_FragColor = vec4(col * v * 2.1, v * fade);
  }
`;
export const SmashEffect = (p: BurstShaderProps) => (
  <BillboardBurst {...p} width={2.4} height={2.4} frag={smashFrag} y={0.9} />
);

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

// --- Dash: rushing-air streaks behind the dasher (warrior charge / archer tumble).

const dashWindFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    // Body-height band — soft top/bottom so it reads as air at the player's back.
    float band = smoothstep(0.5, 0.05, abs(uv.y - 0.5));
    // Crisp horizontal speed-lines scrolling sideways (the rush of air).
    float lines = smoothstep(0.55, 0.95, noise(vec2(uv.x * 5.0 - uTime * 7.0, uv.y * 13.0)));
    // Localized gust: taper at both horizontal ends.
    float taper = smoothstep(0.0, 0.22, uv.x) * smoothstep(1.0, 0.55, uv.x);
    float v = band * (0.25 + lines) * taper;
    vec3 col = vec3(0.82, 0.9, 1.0);                       // airy white-blue
    // Snap in, ease out over the dash.
    float fade = smoothstep(0.0, 0.12, uProgress) * (1.0 - smoothstep(0.55, 1.0, uProgress));
    gl_FragColor = vec4(col * v * 1.8, v * fade);
  }
`;

/** A camera-facing gust of speed-lines, positioned at body height just behind
 *  the dasher (offset opposite the travel direction). */
function DashWind({ durationMs, onComplete, direction }: BurstShaderProps) {
  const { matRef, seed } = useBurstClock(durationMs, onComplete);
  const uniforms = useMemo(() => ({ uTime: { value: seed }, uProgress: { value: 0 } }), [seed]);
  const [dx, , dz] = direction ?? [0, 0, 1];
  const len = Math.hypot(dx, dz) || 1;
  const back = 1.1; // sit ~1.1 units behind the player, at chest height
  const pos: [number, number, number] = [(-dx / len) * back, 1.1, (-dz / len) * back];
  return (
    <Billboard position={pos}>
      <mesh>
        <planeGeometry args={[2.6, 1.7]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={dashWindFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}
export const DashEffect = (p: BurstShaderProps) => <DashWind {...p} />;

// --- Blood Splash: a small, fast crimson spray burst. -------------------------

const bloodSplashFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    
    // Quick outward spray droplets using polar noise
    float n = noise(vec2(ang * 4.5, r * 4.0 - uTime * 8.0));
    float droplets = pow(max(0.0, sin(ang * 5.0 + n * 3.0)), 3.0) * smoothstep(uProgress * 0.9 + 0.1, 0.0, r);
    
    // Core splatter
    float core = smoothstep(0.4 * (uProgress + 0.15), 0.0, r);
    
    // Snap in, fade out very quickly
    float fade = (1.0 - uProgress) * smoothstep(0.0, 0.1, uProgress);
    float v = (droplets * 1.6 + core) * fade;
    
    if (v < 0.03) discard;
    
    vec3 darkRed = vec3(0.35, 0.0, 0.0);
    vec3 brightRed = vec3(0.8, 0.0, 0.0);
    vec3 col = mix(darkRed, brightRed, r + 0.2);
    
    gl_FragColor = vec4(col, v);
  }
`;

export const BloodSplashEffect = (p: BurstShaderProps) => (
  <BillboardBurst
    {...p}
    width={1.6}
    height={1.6}
    durationMs={250}
    frag={bloodSplashFrag}
    y={0.8}
    blending={NormalBlending}
  />
);

// --- Lightning Spark: a crackling electrical zap. ----------------------------

const lightningSparkFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    
    // Crackling electrical arcs coiling outward
    float swirl = noise(vec2(ang * 4.0 + uTime * 6.0, r * 8.0 - uTime * 10.0));
    float arcs = pow(max(0.0, sin(ang * 12.0 + uTime * 15.0 + swirl * 8.0)), 12.0)
                 * smoothstep(0.9, 0.0, r);
                 
    // A quick central spark flash early on
    float spark = smoothstep(0.4 * uProgress, 0.0, r) * (1.0 - smoothstep(0.0, 0.25, uProgress));
    
    float v = arcs * 2.0 + spark * 1.5;
    
    // Electric blue-white color gradient
    vec3 blue = vec3(0.0, 0.55, 1.0);
    vec3 white = vec3(0.9, 0.95, 1.0);
    vec3 col = mix(blue, white, clamp(v * 0.5, 0.0, 1.0));
    
    // Fade out fast
    float fade = (1.0 - uProgress) * smoothstep(0.0, 0.08, uProgress);
    
    gl_FragColor = vec4(col * v * 2.8, v * fade);
  }
`;

export const LightningSparkEffect = (p: BurstShaderProps) => (
  <BillboardBurst
    {...p}
    width={2.2}
    height={2.2}
    durationMs={300}
    frag={lightningSparkFrag}
    y={0.8}
  />
);

// --- Heal Trap: a fantasy-futuristic heal beacon — a curtain of vertical
//     healing lasers rising toward the sky around the trap radius (the radius
//     curtain), plus a ground glow whose centerpiece is a medical CROSS covering
//     the floor cross icon. Built at radius 1 / height 2 so the VFX layer's
//     `scale` (= the trap radius) sizes the wall onto the ring and the cross
//     onto the floor icon. One open cylinder + one ground quad: cheap,
//     procedural, no textures or lights. ------------------------------------------

const healBeamWallFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    // vUv.x wraps the circumference; vUv.y rises 0 (ground) → 1 (sky).
    // A ring of crisp vertical lasers around the perimeter (~10 beams).
    float lasers = pow(abs(sin(vUv.x * 31.4159)), 14.0);
    // Energy streaming upward inside the beams.
    float flow = 0.45 + 0.55 * noise(vec2(vUv.x * 24.0, vUv.y * 4.0 - uTime * 5.0));
    // Reach for the sky: bright at the base, thinning as it climbs.
    float rise = pow(max(0.0, 1.0 - vUv.y), 0.7);
    // A bright pulse sweeping up the column.
    float sweep = smoothstep(0.12, 0.0, abs(fract(vUv.y - uTime * 0.6) - 0.5));
    float v = lasers * ((0.5 + flow) * rise + sweep * 0.8);
    // Snap in, hold, fade out over the back half.
    float life = smoothstep(0.0, 0.12, uProgress) * (1.0 - smoothstep(0.55, 1.0, uProgress));
    vec3 teal = vec3(0.1, 1.0, 0.65);
    vec3 white = vec3(0.85, 1.0, 0.95);
    vec3 col = mix(teal, white, clamp(flow * lasers + sweep, 0.0, 1.0));
    gl_FragColor = vec4(col * v * 2.4, v * life);
  }
`;

const healBeamGroundFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;             // 0 centre → 1 at the radius edge
    vec2 n = p * 2.0;                       // ±1, |n| = 1 → trap radius
    // A medical "+" sized to cover the floor cross icon: a union of two bars.
    const float HALF_LEN = 0.47;            // arm reach (matches floor cross)
    const float HALF_THK = 0.14;            // arm thickness
    const float SOFT = 0.05;
    float armX = (1.0 - smoothstep(HALF_THK - SOFT, HALF_THK, abs(n.y)))
               * (1.0 - smoothstep(HALF_LEN - SOFT, HALF_LEN, abs(n.x)));
    float armZ = (1.0 - smoothstep(HALF_THK - SOFT, HALF_THK, abs(n.x)))
               * (1.0 - smoothstep(HALF_LEN - SOFT, HALF_LEN, abs(n.y)));
    float cross = max(armX, armZ);
    // Subtle living shimmer (no rotation — it reads as steady light on the cross).
    float shimmer = 0.8 + 0.2 * noise(n * 8.0 + vec2(0.0, -uTime * 2.0));
    // Bright rim ring sitting on the trap radius (grounds the curtain).
    float ring = smoothstep(0.06, 0.0, abs(r - 0.94));
    float v = cross * shimmer * 1.5 + ring * 1.1;
    vec3 col = mix(vec3(0.1, 1.0, 0.65), vec3(0.85, 1.0, 0.95), clamp(cross + ring, 0.0, 1.0));
    float life = smoothstep(0.0, 0.1, uProgress) * (1.0 - smoothstep(0.6, 1.0, uProgress));
    gl_FragColor = vec4(col * v * 2.0, v * life);
  }
`;

/** The vertical curtain of light: an open cylinder at radius 1, height 2 (so a
 *  uniform `scale` of the trap radius lands the wall on the ring and lifts the
 *  beam ~2× the radius toward the sky). */
function HealBeamWall({ durationMs, onComplete }: BurstShaderProps) {
  const { matRef, seed } = useBurstClock(durationMs, onComplete);
  const uniforms = useMemo(() => ({ uTime: { value: seed }, uProgress: { value: 0 } }), [seed]);
  return (
    <mesh position={[0, 1, 0]}>
      <cylinderGeometry args={[1, 1, 2, 48, 1, true]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={UV_VERTEX}
        fragmentShader={healBeamWallFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

export const HealBeamEffect = (p: BurstShaderProps) => (
  <group>
    <HealBeamWall {...p} />
    <GroundBurst {...p} size={2} frag={healBeamGroundFrag} />
  </group>
);

// --- Singularity Blast: the black hole's final detonation — a hot implosion
//     flash that snaps outward into a purple→magenta shockwave laced with cyan
//     energy spikes. One ground quad: cheap, procedural, sci-fi. ----------------

const singularityBlastFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;            // 0 centre → 1 at the blast radius
    float ang = atan(p.y, p.x);
    // Shockwave front expanding to the full radius.
    float edge = uProgress;
    float ring = smoothstep(0.12, 0.0, abs(r - edge));
    // Radial energy spikes shooting out behind the front.
    float spikes = pow(max(0.0, sin(ang * 14.0)), 6.0) * smoothstep(edge + 0.1, 0.0, r);
    // A blinding implosion flash at the very start (the collapsed core releasing).
    float flash = smoothstep(0.5, 0.0, r) * (1.0 - smoothstep(0.0, 0.3, uProgress));
    float shimmer = 0.7 + 0.3 * noise(p * 14.0 + uTime * 5.0);
    float v = (ring * 1.4 + spikes * 0.7) * shimmer + flash * 1.6;
    vec3 purple = vec3(0.5, 0.1, 0.95);
    vec3 magenta = vec3(0.95, 0.2, 0.85);
    vec3 cyan = vec3(0.6, 0.97, 1.0);
    vec3 col = mix(purple, magenta, ring);
    col = mix(col, cyan, clamp(flash + spikes * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col * v * 2.2, v * (1.0 - uProgress * 0.9));
  }
`;
// Sized so the shockwave front (which reaches r=1.0 of the quad's half-width)
// lands on the blast radius when spawned with scale = radius (half-width = size/2).
export const SingularityBlastEffect = (p: BurstShaderProps) => (
  <GroundBurst {...p} size={2} frag={singularityBlastFrag} />
);

// --- Chest Spawn: golden expanding ground rune + vertical sparkles column ----

const chestSpawnGroundFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    
    float r1 = smoothstep(0.06, 0.0, abs(r - 0.6 * uProgress));
    float r2 = smoothstep(0.04, 0.0, abs(r - 0.95 * uProgress));
    float glyph = pow(max(0.0, sin(ang * 8.0 + uTime * 2.0)), 6.0) * smoothstep(0.95 * uProgress, 0.0, r);
    
    float v = r1 + r2 + glyph * 0.5;
    vec3 col = mix(vec3(1.0, 0.75, 0.1), vec3(1.0, 0.95, 0.6), r2);
    float fade = 1.0 - uProgress;
    gl_FragColor = vec4(col * v * 2.0, v * fade);
  }
`;

const chestSpawnColFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  ${GLSL_NOISE}
  void main(){
    vec2 uv = vUv;
    float rise = smoothstep(0.0, 0.15, uProgress) * (1.0 - smoothstep(0.6, 1.0, uProgress));
    float beam = smoothstep(0.3, 0.0, abs(uv.x - 0.5)) * smoothstep(1.0, 0.0, uv.y);
    float sparks = smoothstep(0.65, 0.95, noise(uv * vec2(8.0, 5.0) + vec2(uTime * 1.5, -uTime * 2.0)));
    sparks *= smoothstep(0.4, 0.0, abs(uv.x - 0.5));
    float flare = smoothstep(0.2, 0.0, distance(uv, vec2(0.5, 0.1))) * rise * 1.5;
    
    float v = (beam * 0.4 + sparks * 1.2) * rise + flare;
    vec3 gold = vec3(1.0, 0.84, 0.0);
    vec3 whiteGold = vec3(1.0, 0.95, 0.7);
    vec3 col = mix(gold, whiteGold, uv.y * 0.5 + flare);
    gl_FragColor = vec4(col * v * 2.5, v * rise);
  }
`;

export const ChestSpawnEffect = (p: BurstShaderProps) => (
  <group>
    <GroundBurst {...p} size={5} frag={chestSpawnGroundFrag} />
    <BillboardBurst {...p} width={3.0} height={3.5} frag={chestSpawnColFrag} y={1.5} />
  </group>
);

// --- Ninja Slash 1 (120°): a sharp dark-purple front slash fitting exactly its radius of 4.0

const ninjaSlash1Frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  void main(){
    const float TAU = 6.28318530718;
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;                        // 0 centre → 1 edge
    
    // Signed angle from "forward", in turns: -0.5 .. 0.5
    float front = atan(p.x, -p.y) / TAU;
    
    // Define angular limits for 120° (half is 60° / 360° = 0.16667)
    float halfAngle = 0.16667;
    
    // Very sharp but anti-aliased angular mask
    float angMask = smoothstep(halfAngle + 0.003, halfAngle - 0.003, abs(front));
    
    // Very sharp but anti-aliased radial mask matching EXACTLY the attack radius of 4.0 (r = 1.0)
    float radMask = smoothstep(1.0, 0.98, r) * smoothstep(0.48, 0.5, r);
    
    // Total geometric mask
    float mask = angMask * radMask;
    
    // The blade tip sweeps across the front arc, one side to the other.
    // Starts at -halfAngle, ends at +halfAngle.
    float tipPos = -halfAngle + uProgress * (halfAngle * 2.0);
    float delta = tipPos - front;                     // >=0 → already carved
    float swept = step(0.0, delta);
    
    // Comet trail: brightest at the tip, fading back along the swept arc.
    float trail = swept * smoothstep(halfAngle * 2.0, 0.0, delta);
    
    // Hot leading edge — the steel glint at the blade tip.
    float tip = smoothstep(0.02, 0.0, abs(delta)) * swept;
    
    // Base ring line (faint guide along the outer edge for gameplay clarity)
    float outerRing = smoothstep(0.05, 0.0, abs(r - 0.99));
    
    // Core visual intensity
    float v = (trail * 0.8 + tip * 2.0 + outerRing * 0.4) * mask;
    
    // Almost black base with very dark magenta shadows and almost white glow
    vec3 baseBlack = vec3(0.005, 0.005, 0.01);
    vec3 darkMagenta = vec3(0.08, 0.0, 0.04);
    vec3 almostWhite = vec3(0.96, 0.94, 0.98);
    
    vec3 col = mix(baseBlack, darkMagenta, clamp(trail * 1.5 + tip * 0.3 + outerRing * 0.6, 0.0, 1.0));
    col = mix(col, almostWhite, clamp(tip * 1.4, 0.0, 1.0));
    
    // Fade out cleanly over the lifetime
    float life = 1.0 - smoothstep(0.7, 1.0, uProgress);
    
    gl_FragColor = vec4(col * v * 3.0, v * life);
  }
`;

export const NinjaSlash1Effect = (p: BurstShaderProps) => (
  <GroundBurst {...p} size={8} frag={ninjaSlash1Frag} />
);

// --- Ninja Slash 2 (120°): a sharp dark-purple front slash fitting exactly its radius of 4.0

const ninjaSlash2Frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uProgress;
  void main(){
    const float TAU = 6.28318530718;
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;                        // 0 centre → 1 edge
    
    // Signed angle from "forward", in turns: -0.5 .. 0.5
    float front = atan(p.x, -p.y) / TAU;
    
    // Define angular limits for 120° (half is 60° / 360° = 0.16667)
    float halfAngle = 0.16667;
    
    // Very sharp but anti-aliased angular mask
    float angMask = smoothstep(halfAngle + 0.003, halfAngle - 0.003, abs(front));
    
    // Very sharp but anti-aliased radial mask matching EXACTLY the attack radius of 4.0 (r = 1.0)
    float radMask = smoothstep(1.0, 0.98, r) * smoothstep(0.48, 0.5, r);
    
    // Total geometric mask
    float mask = angMask * radMask;
    
    // The blade tip sweeps across the front arc, one side to the other.
    // Starts at -halfAngle, ends at +halfAngle.
    float tipPos = -halfAngle + uProgress * (halfAngle * 2.0);
    float delta = tipPos - front;                     // >=0 → already carved
    float swept = step(0.0, delta);
    
    // Comet trail: brightest at the tip, fading back along the swept arc.
    float trail = swept * smoothstep(halfAngle * 2.0, 0.0, delta);
    
    // Hot leading edge — the steel glint at the blade tip.
    float tip = smoothstep(0.02, 0.0, abs(delta)) * swept;
    
    // Base ring line (faint guide along the outer edge for gameplay clarity)
    float outerRing = smoothstep(0.05, 0.0, abs(r - 0.99));
    
    // Core visual intensity
    float v = (trail * 0.8 + tip * 2.0 + outerRing * 0.4) * mask;
    
    // Almost black base with very dark magenta shadows and almost white glow
    vec3 baseBlack = vec3(0.005, 0.005, 0.01);
    vec3 darkMagenta = vec3(0.08, 0.0, 0.04);
    vec3 almostWhite = vec3(0.96, 0.94, 0.98);
    
    vec3 col = mix(baseBlack, darkMagenta, clamp(trail * 1.5 + tip * 0.3 + outerRing * 0.6, 0.0, 1.0));
    col = mix(col, almostWhite, clamp(tip * 1.4, 0.0, 1.0));
    
    // Fade out cleanly over the lifetime
    float life = 1.0 - smoothstep(0.7, 1.0, uProgress);
    
    gl_FragColor = vec4(col * v * 3.0, v * life);
  }
`;

export const NinjaSlash2Effect = (p: BurstShaderProps) => (
  <GroundBurst {...p} size={8} frag={ninjaSlash2Frag} />
);



