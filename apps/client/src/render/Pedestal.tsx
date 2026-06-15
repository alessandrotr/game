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

/** A sculpted, tiered dais: a wide beveled base → mid tier → polished top plate,
 *  with a glowing rim accent + ground halo tinted by the equipped color. The top
 *  surface sits at y≈0 so the champion stands on it; tiers descend below. */
function PedestalBase({ color }: { color: string }) {
  return (
    <group>
      {/* Wide footprint. */}
      <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.64, 1.76, 0.08, 96]} />
        <meshStandardMaterial color="#1b1e2a" metalness={0.55} roughness={0.45} />
      </mesh>
      {/* Beveled mid tier. */}
      <mesh position={[0, -0.11, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.46, 1.62, 0.1, 96]} />
        <meshStandardMaterial color="#13151f" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Polished top plate. */}
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <cylinderGeometry args={[1.4, 1.46, 0.06, 96]} />
        <meshStandardMaterial color="#0c0d14" metalness={0.55} roughness={0.45} />
      </mesh>
      {/* Glowing rim accent at the top edge (equipped color). */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.42, 0.022, 16, 96]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Faint halo skirt around the base. */}
      <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.52, 1.78, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

export function Pedestal({ effect = 'ring', color, color2 }: PedestalProps) {
  return (
    <group>
      <PedestalBase color={color} />

      {effect === 'ring' ? (
        <>
          <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.04, 1.26, 96]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.78, 0.86, 96]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} />
          </mesh>
        </>
      ) : (
        <ShaderDisc mode={PEDESTAL_MODE[effect]} color={color} color2={color2} />
      )}
    </group>
  );
}
