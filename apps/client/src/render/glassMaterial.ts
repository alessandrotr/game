import * as THREE from 'three';

/**
 * A cheap, stylized "glass" material for building windows.
 *
 * It is intentionally NOT a transmission/refraction material: those render the
 * scene into an offscreen buffer per frame and would wreck performance with the
 * dozens of windows scattered around town. Instead this is a self-contained
 * fresnel shader — a warm dusk interior glow head-on that fades to a cool,
 * reflective sheen at grazing angles. No lights, no textures, no render targets,
 * so it costs about the same as the flat emissive box it replaces.
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
  uniform vec3 uInterior;
  uniform vec3 uReflect;
  uniform float uFresnelPower;
  uniform float uOpacity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uFresnelPower);
    vec3 col = mix(uInterior, uReflect, fres);
    // Faint diagonal highlight so flat panes catch a glassy streak as the
    // camera moves — view-independent, so it costs nothing per frame.
    float streak = smoothstep(0.72, 0.98, sin((vWorldPos.x + vWorldPos.y) * 2.3) * 0.5 + 0.5);
    col += streak * 0.12;
    float alpha = clamp(mix(uOpacity, 1.0, fres) + streak * 0.15, 0.0, 1.0);
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
    uniforms: {
      uInterior: { value: new THREE.Color('#ffe1a0').convertSRGBToLinear() },
      uReflect: { value: new THREE.Color('#aebfd2').convertSRGBToLinear() },
      uFresnelPower: { value: 3.0 },
      uOpacity: { value: 0.7 },
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
