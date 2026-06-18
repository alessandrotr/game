/**
 * Ground aim-indicator shaders, styled after League of Legends' spell
 * indicators. The whole look is built from **signed-distance fields with
 * screen-space-derivative (`fwidth`) anti-aliasing**, which is what makes the
 * lines stay pixel-crisp at any camera distance and never shimmer — the canvas
 * runs with MSAA off and there's no bloom pass, so crispness and glow are both
 * authored here rather than leaned on from post-FX.
 *
 * Everything is procedural (no textures), additive over the scene (premultiplied:
 * the fragment emits `color * intensity` with `alpha = 1`), and drawn on a single
 * quad per indicator — and only the one ability you're currently aiming is ever
 * on screen — so the cost is negligible. Requires WebGL2 (derivatives are core).
 */

/** LoL spell-indicator teal (sRGB), and the same value as raw sRGB floats for
 *  the shader (we write straight to the sRGB framebuffer, like the beam shaders,
 *  so we must bypass three's linear color conversion). */
export const INDICATOR_CYAN = '#39e0ff';
export const INDICATOR_CYAN_RGB: [number, number, number] = [0.224, 0.878, 1.0];

/** Where the bright main ring sits in the disc shader's unit space; scale the
 *  mesh by `worldRadius / RING_R` so that ring lands exactly on the radius. */
export const RING_R = 0.955;
/** Where the bright rails sit in the lane shader's half-width; set the plane
 *  width to `hitWidth / RAIL_X` so the rails land exactly on the hit capsule. */
export const RAIL_X = 0.72;

/** Even, integer tick counts (minor aligned to major) sized so ticks keep a
 *  roughly constant world spacing around a circle of the given radius. Integer
 *  counts are required: the shader spaces ticks with `cos(angle * N)`, which is
 *  only seamless across the atan2 wrap when N is a whole number. */
export function tickCounts(radius: number): { minor: number; major: number } {
  const circ = Math.PI * 2 * Math.max(0.5, radius);
  const major = Math.max(6, Math.round(circ / 3.2)); // a long tick ~every 3.2 units
  const ratio = Math.max(2, Math.round(circ / 0.62 / major)); // short ticks ~every 0.62 units
  return { minor: major * ratio, major };
}

/**
 * Filled circle / disc indicator (point ground-targets + the caster's range
 * ring). Maps a 2×2 plane to the unit disc; scale the mesh by `radius / RING_R`.
 * `uFill` fades the interior glow + the live ripple in (1 = the cursor's AoE
 * disc, 0 = the bare max-range ring around the caster).
 */
export const CIRCLE_INDICATOR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uFill;
  uniform float uTicks;       // minor tick count (integer)
  uniform float uSeed;

  void main(){
    vec2 p = (vUv - 0.5) * 2.0;            // -1..1 across the disc
    float r = length(p);
    if (r > 1.08) discard;                 // trim the square plane's corners
    float a = atan(p.y, p.x);
    float ra = fwidth(r) + 1e-5;           // one pixel, in r-space

    // --- one crisp rim line, ~2px regardless of camera distance ---
    float w = 1.1 * ra;
    float ring = 1.0 - smoothstep(w, w + 1.2 * ra, abs(r - ${RING_R}));

    // --- short, subtle rune ticks just inside the rim (smooth cos^k peaks =
    //     no aliasing, seamless across the atan2 wrap) ---
    float tick = pow(max(cos(a * uTicks), 0.0), 40.0);
    float band = smoothstep(0.902, 0.912, r) * (1.0 - smoothstep(0.935, 0.944, r));
    float ticks = tick * band * 0.5;

    // --- tight neon glow hugging the rim, constant width in *pixels* (so big
    //     and small circles read identically — no foggy interior) ---
    float glow = exp(-abs(r - ${RING_R}) / ra * 0.22) * 0.5;

    // --- barely-there interior tint (AoE disc only) ---
    float fill = 0.03 * smoothstep(0.0, 1.0, r) * uFill;

    float pulse = 0.94 + 0.06 * sin(uTime * 2.4 + uSeed);
    float m = (ring + ticks + glow) * pulse + fill;
    m *= 1.0 - smoothstep(1.0, 1.08, r);   // fade the thin outer halo to nothing

    vec3 col = mix(uColor, vec3(0.82, 0.98, 1.0), clamp(ring + ticks, 0.0, 1.0));
    col *= 0.6 + 1.2 * ring;               // crisp near-white core on the rim
    gl_FragColor = vec4(col * m, 1.0);     // premultiplied additive
  }
`;

/**
 * Directional skillshot "lane" indicator: two clean lines that run parallel on
 * the projectile's hit capsule, then converge to a single point at the tip — the
 * rails themselves form the arrow, no separate head (à la the reference Ezreal-Q
 * look). Drawn on a plane sized (hitWidth / RAIL_X) × length and laid flat; with
 * the project's plane convention `vUv.y = 1` is the caster end, `vUv.y = 0` the tip.
 */
export const LANE_INDICATOR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uSeed;

  #define RAIL ${RAIL_X}
  #define HEAD 0.84      // where the rails start angling in toward the tip point

  void main(){
    float cx = abs(vUv.x - 0.5) * 2.0;     // 0 centre → 1 plane edge
    float t  = 1.0 - vUv.y;                // 0 caster → 1 tip
    float ca = fwidth(cx) + 1e-5;
    float w  = 1.1 * ca;

    // Two clean lines that run parallel on the hit capsule, then converge to a
    // single point at the tip — the rails *are* the arrow, no separate head.
    float taper  = clamp((t - HEAD) / (1.0 - HEAD), 0.0, 1.0);
    float railX  = RAIL * (1.0 - taper);
    float rail   = 1.0 - smoothstep(w, w + 1.2 * ca, abs(cx - railX));
    float glow   = exp(-abs(cx - railX) / ca * 0.22) * 0.42;
    float inside = 1.0 - smoothstep(railX + 0.04, railX + 0.16, cx); // keep the outside dark
    rail *= inside;
    glow *= inside;

    float m = (rail + glow) * (0.94 + 0.06 * sin(uTime * 2.6 + uSeed));

    vec3 col = mix(uColor, vec3(0.82, 0.98, 1.0), clamp(rail, 0.0, 1.0));
    col *= 0.6 + 1.2 * rail;
    gl_FragColor = vec4(col * m, 1.0);     // premultiplied additive
  }
`;
