import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { AdditiveBlending, Color, DoubleSide, type ShaderMaterial } from 'three';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { maybeFocusStructure, useFocusStore } from '../store/useFocusStore';
import { PODIUM_POSITION, PODIUM_ROTATION } from './TownPodiums';
import { FadeGroup } from './FadeGroup';

/**
 * A standing stone "tafel" (tablet) in town. Its face runs a gold leaderboard
 * shader — animated rank bars, a sweeping sheen, and a pulsing engraved frame —
 * and clicking it opens the Leaderboard dialog. Lives in the town scene only
 * (it's mounted alongside the fountain), so it never appears in the arena.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;   // deep gold (base)
  uniform vec3 uColor2;  // bright gold (glow)

  void main() {
    vec2 uv = vUv;

    // Engraved frame: bright near the edges, with a slow breathing pulse.
    vec2 e = smoothstep(0.0, 0.07, uv) * smoothstep(0.0, 0.07, 1.0 - uv);
    float frame = 1.0 - e.x * e.y;

    // Three "rank" bars at descending heights — each fills to an animated
    // length, like a live standings board ticking up and down.
    float bars = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float yc = 0.66 - fi * 0.22;                       // top bar = rank 1
      float row = smoothstep(0.055, 0.0, abs(uv.y - yc) - 0.045);
      float len = 0.78 - fi * 0.16 + 0.06 * sin(uTime * 0.9 + fi * 1.7);
      float fill = step(0.16, uv.x) * smoothstep(len, len - 0.015, uv.x);
      bars += row * fill;
    }

    // Diagonal light sheen sweeping across the slab.
    float sweep = sin((uv.x + uv.y) * 6.2831 - uTime * 1.6);
    float sheen = smoothstep(0.86, 1.0, sweep) * 0.5;

    // Composite: dark gold gradient + glowing bars + sheen + pulsing frame.
    vec3 col = mix(uColor * 0.10, uColor * 0.42, uv.y);
    col += uColor2 * bars * 1.3;
    col += uColor2 * sheen;
    col += uColor2 * frame * (0.45 + 0.35 * sin(uTime * 1.8));

    float alpha = clamp(0.22 + bars + frame * 0.75 + sheen, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The glowing engraved face — its own component so the shader hooks stay tidy. */
function TabletFace() {
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color('#c8a24a') },
      uColor2: { value: new Color('#ffe6a8') },
    }),
    [],
  );
  useFrame((_, dt) => {
    const u = mat.current?.uniforms.uTime;
    if (u) u.value += dt;
  });
  return (
    <mesh position={[0, 1.45, 0.12]}>
      <planeGeometry args={[1.42, 1.86]} />
      <shaderMaterial
        ref={mat}
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

interface TownLeaderboardTabletProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function TownLeaderboardTablet({
  position = [7, 0, -3],
  rotation = [0, -0.7, 0],
}: TownLeaderboardTabletProps) {
  // Restore the cursor on unmount so it never sticks as a pointer.
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  // The tablet itself fades out whenever ANY structure is focused — including the
  // leaderboard, where the camera turns to frame the champions' podium instead, so
  // the tablet must clear the shot. The podium stays (see TownPodiums' `show`).
  const show = useFocusStore((s) => !s.target);
  const focused = useFocusStore((s) => !!s.target);

  const open = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return; // left-click only
    e.stopPropagation();
    useLeaderboardStore.getState().setOpen(true);
    // Focus the CHAMPIONS' PODIUM (not the tablet): the camera glides to face the
    // podium's front, framed screen-left (the rig's side-shift) so the standings
    // panel docks right. faceYaw = the podium's facing, so we view its front.
    maybeFocusStructure('leaderboard', 'Leaderboard', PODIUM_ROTATION[1], PODIUM_POSITION[0], 0, PODIUM_POSITION[2]);
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? 'pointer' : '';
  };

  return (
    <FadeGroup show={show} position={position} rotation={rotation}>
      {/* Cool polished-slate base. Low metalness so it shows its own color (not a
          mirror of the dark dusk env) + a faint cool emissive so it never sinks
          to black, with a glossy roughness for crisp light highlights. */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.95, 0.4, 0.65]} />
        <meshStandardMaterial
          color="#414b66"
          roughness={0.42}
          metalness={0.25}
          emissive="#18223e"
          emissiveIntensity={0.45}
        />
      </mesh>
      {/* Slab — same cool slate, framing the glowing gold face. */}
      <mesh position={[0, 1.45, 0]} castShadow>
        <boxGeometry args={[1.7, 2.15, 0.22]} />
        <meshStandardMaterial
          color="#4a5570"
          roughness={0.38}
          metalness={0.25}
          emissive="#1d2a48"
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* Glowing engraved leaderboard face. */}
      <TabletFace />

      {/* Floating label — hidden while focused (the HUD shows the big title instead). */}
      {!focused && (
        <Billboard position={[0, 2.95, 0]}>
          <Text
            fontSize={0.32}
            color="#ffe6a8"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            Leaderboard
          </Text>
        </Billboard>
      )}

      {/* Invisible click volume covering the whole monument. */}
      <mesh
        position={[0, 1.4, 0.2]}
        onPointerDown={open}
        onPointerOver={hover(true)}
        onPointerOut={hover(false)}
      >
        <boxGeometry args={[1.9, 2.5, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </FadeGroup>
  );
}
