import { useMemo, useRef } from 'react';
import { AdditiveBlending, Color, FrontSide, type ShaderMaterial } from 'three';
import { useUTime } from './common';

/**
 * A persistent fresnel "force-field" bubble shown around a player while an
 * absorb shield holds. Rim-lit (bright at glancing angles), gently pulsing,
 * with a faint hex shimmer. One sphere, additive, no texture — cheap enough to
 * leave on for as many shielded players as a match has.
 */

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main(){
    vLocal = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  uniform float uTime;
  uniform vec3 uColor;
  void main(){
    float fres = pow(1.0 - max(0.0, dot(vNormal, vView)), 2.5);
    // Faint hex-ish shimmer banding that drifts over the surface.
    float bands = 0.5 + 0.5 * sin(vLocal.y * 14.0 + uTime * 2.0)
                          * sin(vLocal.x * 14.0 - uTime * 1.5);
    float pulse = 0.82 + 0.18 * sin(uTime * 4.0);
    float v = (fres * 1.4 + bands * 0.12) * pulse;
    gl_FragColor = vec4(uColor * (0.5 + fres * 1.6), v * 0.6);
  }
`;

export function ShieldBubble({ color = '#aab4ff', radius = 1.0 }: { color?: string; radius?: number }) {
  const matRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: Math.random() * 10 }, uColor: { value: new Color(color) } }),
    [color],
  );
  useUTime(matRef);
  return (
    <mesh>
      <sphereGeometry args={[radius, 24, 18]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={FrontSide}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}
