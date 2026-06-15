import * as THREE from 'three';

/**
 * A cheap, stylized "transparent glass" material for building windows.
 *
 * It is intentionally NOT a transmission/refraction material: those render the
 * scene into an offscreen buffer per frame and would wreck performance with the
 * dozens of windows scattered around town. Instead this is a self-contained
 * fresnel shader: nearly clear head-on (so the warm lit interior panel behind
 * each pane shows straight through — you "see into" the house) and brightening
 * to a cool sky reflection at grazing angles, with a glassy sheen streak. No
 * lights, no textures, no render targets, so it costs about the same as the flat
 * box it replaces.
 *
 * One material instance is shared across every window in a given renderer (see
 * {@link glassMaterialFor}), keeping draw state and program switches minimal.
 */

const VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uReflect;
  uniform float uFresnelPower;
  uniform float uBaseAlpha;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uFresnelPower);
    // Faint cool tint head-on, brightening to a sky reflection at the edges.
    vec3 col = mix(uTint, uReflect, fres);
    // Diagonal glass sheen — view-independent, so it costs nothing per frame.
    float streak = smoothstep(0.55, 0.95, sin(vWorldPos.x * 1.7 + vWorldPos.y * 2.3) * 0.5 + 0.5);
    col += streak * 0.32;
    // A visible glassy film head-on (the interior still shows through), turning
    // reflective at glancing angles, with a crisp sheen highlight.
    float alpha = clamp(mix(uBaseAlpha, 0.9, fres) + streak * 0.35, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Uniform colors are authored in sRGB; convert to linear so the
    // tonemapping/colorspace chunks above output the same range as the
    // meshStandardMaterials around them.
    depthWrite: false, // clear glass; let the lit interior behind show straight through
    uniforms: {
      uTint: { value: new THREE.Color('#b7c6d4').convertSRGBToLinear() },
      uReflect: { value: new THREE.Color('#e4eef7').convertSRGBToLinear() },
      uFresnelPower: { value: 2.2 },
      uBaseAlpha: { value: 0.16 },
    },
  });
}

const cache = new WeakMap<THREE.WebGLRenderer, THREE.ShaderMaterial>();

/**
 * The shared glass material for a renderer. Keyed per-renderer (the town hub and
 * its attract-mode backdrop are separate WebGL contexts) so the program/uniforms
 * are never shared across contexts, while all windows within one context reuse a
 * single instance.
 */
export function glassMaterialFor(gl: THREE.WebGLRenderer): THREE.ShaderMaterial {
  let material = cache.get(gl);
  if (!material) {
    material = createGlassMaterial();
    cache.set(gl, material);
  }
  return material;
}
