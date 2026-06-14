import type { PedestalEffect } from '@arena/shared';

/**
 * The pedestal effect shader, shared by the in-scene {@link Pedestal} (R3F) and
 * the store's offscreen thumbnail renderer ({@link pedestalThumbnails}). One
 * additive-blended quad; `uMode` selects the effect (kept in sync with
 * {@link PEDESTAL_MODE}).
 */

/** Effect → shader branch id. `ring` (0) is the plain colored ring. */
export const PEDESTAL_MODE: Record<PedestalEffect, number> = {
  ring: 0,
  pulse: 1,
  aurora: 2,
  holo: 3,
  vortex: 4,
  prism: 5,
};

export const PEDESTAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const PEDESTAL_FRAG = /* glsl */ `
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
    } else {                         // 0 — plain ring
      float band = smoothstep(0.6, 0.68, r) * smoothstep(1.0, 0.92, r);
      col = uColor;
      alpha = band * 0.8;
    }

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;
