import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide } from 'three';
import type { PedestalEffect } from '@arena/shared';
import { PEDESTAL_FRAG, PEDESTAL_MODE, PEDESTAL_VERT } from './pedestalShader';

/**
 * The glowing circle under the champion in the 3D portrait. `ring` is the plain
 * two-ring rune (cheap, used for the default + classic colored pedestals); the
 * animated effects are a single additive-blended quad driven by a fragment
 * shader (one draw call, no textures), so they stay light enough to run in the
 * always-on HUD portrait as well as the big showcase. The shader is shared with
 * the store's thumbnail renderer (see {@link PEDESTAL_FRAG}).
 */

const VERT = PEDESTAL_VERT;
const FRAG = PEDESTAL_FRAG;

/** The animated effect layer (a single shader quad lying flat on the base). The
 *  uniforms object is created once and mutated in place — three reads its
 *  `.value`s each frame, so this drives the animation without React churn. */
function ShaderDisc({ mode, color, color2 }: { mode: number; color: string; color2?: string }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMode: { value: mode },
      uColor: { value: new Color(color) },
      uColor2: { value: new Color(color2 ?? color) },
    }),
    // Created once; live changes are written in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Reflect prop changes (re-equipping a different pedestal) without remounting.
  useEffect(() => {
    uniforms.uMode.value = mode;
    uniforms.uColor.value.set(color);
    uniforms.uColor2.value.set(color2 ?? color);
  }, [uniforms, mode, color, color2]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
  });

  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1.5, 96]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
      />
    </mesh>
  );
}

export interface PedestalProps {
  effect?: PedestalEffect;
  color: string;
  color2?: string;
}

export function Pedestal({ effect = 'ring', color, color2 }: PedestalProps) {
  return (
    <group>
      {/* Physical base disc. */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[1.35, 1.5, 0.1, 64]} />
        <meshStandardMaterial color="#14151d" metalness={0.5} roughness={0.5} />
      </mesh>

      {effect === 'ring' ? (
        <>
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.12, 1.32, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} />
          </mesh>
        </>
      ) : (
        <ShaderDisc mode={PEDESTAL_MODE[effect]} color={color} color2={color2} />
      )}
    </group>
  );
}
