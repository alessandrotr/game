import { useEffect } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { AdditiveBlending } from 'three';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { maybeFocusStructure, useFocusStore } from '../store/useFocusStore';
import { PortalEffect } from './PortalEffect';
import { FadeGroup } from './FadeGroup';

/**
 * "The Breach" — the zombie co-op shrine in town. A cracked tomb monolith split
 * down the middle, a sickly-green necrotic rift swirling in the fracture, a
 * glowing-eyed skull at its foot, and a low pool of ground mist. Clicking it
 * opens the co-op squad browser (the same way the leaderboard tablet opens the
 * standings). Town scene only; the dark counterpart to the PvP duel altar.
 */

/** Mossy, weathered tomb stone — green-grey, emissive-lifted so it never reads
 *  as flat black. */
const TOMB = {
  color: '#3c4a3c',
  roughness: 0.82,
  metalness: 0.15,
  emissive: '#16241a',
  emissiveIntensity: 0.4,
} as const;

/** Bleached bone. */
const BONE = { color: '#cfc8b4', roughness: 0.7, metalness: 0.05 } as const;

/** A femur-style bone along its local Y axis: a shaft with two rounded knobs at
 *  each end (the classic dog-bone / crossbone silhouette). */
function Bone({ length = 0.62 }: { length?: number }) {
  const r = 0.028;
  const knob = 0.05;
  const off = 0.042;
  const h = length / 2;
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, length, 10]} />
        <meshStandardMaterial {...BONE} />
      </mesh>
      {[h, -h].map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          <mesh position={[off, 0, 0]} castShadow>
            <sphereGeometry args={[knob, 10, 10]} />
            <meshStandardMaterial {...BONE} />
          </mesh>
          <mesh position={[-off, 0, 0]} castShadow>
            <sphereGeometry args={[knob, 10, 10]} />
            <meshStandardMaterial {...BONE} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A weathered headstone (origin at its base): a chunky slab on a foot, capped
 *  with a full-width rounded arch, with carved face details — a recessed panel, a
 *  small cross, and engraved lines (no text). The two halves of the cracked tomb. */
const TOMB_DARK = { color: '#2a362a', roughness: 0.9, metalness: 0.12, emissive: '#0d160e', emissiveIntensity: 0.3 } as const;
const W = 0.86; // slab width
const D = 0.4; // slab depth
const FACE = D / 2 + 0.012; // z of carved details, just proud of the front face

function Headstone() {
  return (
    <group>
      {/* Base foot — a wider, short plinth block. */}
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[W + 0.16, 0.16, D + 0.12]} />
        <meshStandardMaterial {...TOMB} />
      </mesh>
      {/* Slab body. */}
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 0.56, D]} />
        <meshStandardMaterial {...TOMB} />
      </mesh>
      {/* Full-width rounded arch cap. */}
      <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[W / 2, W / 2, D, 24]} />
        <meshStandardMaterial {...TOMB} />
      </mesh>

      {/* --- Carved face details (no text) --- */}
      {/* Recessed inset panel. */}
      <mesh position={[0, 0.46, FACE]}>
        <planeGeometry args={[W - 0.2, 0.62]} />
        <meshStandardMaterial {...TOMB_DARK} />
      </mesh>
      {/* Small cross near the top of the panel. */}
      <mesh position={[0, 0.62, FACE + 0.004]}>
        <boxGeometry args={[0.05, 0.2, 0.02]} />
        <meshStandardMaterial {...TOMB_DARK} />
      </mesh>
      <mesh position={[0, 0.66, FACE + 0.004]}>
        <boxGeometry args={[0.16, 0.05, 0.02]} />
        <meshStandardMaterial {...TOMB_DARK} />
      </mesh>
      {/* Engraved lines below (a nameplate, suggested without text). */}
      <mesh position={[0, 0.4, FACE + 0.004]}>
        <boxGeometry args={[0.46, 0.02, 0.02]} />
        <meshStandardMaterial {...TOMB_DARK} />
      </mesh>
      <mesh position={[0, 0.34, FACE + 0.004]}>
        <boxGeometry args={[0.38, 0.02, 0.02]} />
        <meshStandardMaterial {...TOMB_DARK} />
      </mesh>
      <mesh position={[0, 0.28, FACE + 0.004]}>
        <boxGeometry args={[0.3, 0.02, 0.02]} />
        <meshStandardMaterial {...TOMB_DARK} />
      </mesh>
    </group>
  );
}

interface TownBreachRiftProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function TownBreachRift({
  // West side of the plaza, beyond the duel altar (mirrors the podiums' offset on
  // the east side).
  position = [-11.5, 0, -3.5],
  rotation = [0, 0.55, 0],
}: TownBreachRiftProps) {
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  // Hide the 3D floating label while focused; fade the whole shrine out when a
  // DIFFERENT structure is focused.
  const focused = useFocusStore((s) => s.panel === 'coop' && !!s.target);
  const show = useFocusStore((s) => !s.target || s.panel === 'coop');

  const open = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return; // left-click only
    e.stopPropagation();
    useZombieLobbyStore.getState().setMenuOpen(true);
    maybeFocusStructure('coop', 'The Breach', rotation[1], position[0], 0, position[2]);
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? 'pointer' : '';
  };

  return (
    <FadeGroup show={show} position={position} rotation={rotation}>
      {/* Plinth. */}
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.0, 0.25, 1.2]} />
        <meshStandardMaterial color="#34402f" roughness={0.9} metalness={0.1} emissive="#101a10" emissiveIntensity={0.35} />
      </mesh>

      {/* Two leaning headstones on the plinth, the rift glowing between them. The
          lean pivots from the base (group origin at the plinth top). */}
      <group position={[-0.5, 0.24, 0]} rotation={[0, 0, 0.06]}>
        <Headstone />
      </group>
      <group position={[0.5, 0.24, 0]} rotation={[0, 0, -0.06]}>
        <Headstone />
      </group>

      {/* Necrotic rift swirling in the fracture — a full travel-portal-sized
          gateway (PortalEffect self-grounds, so no y offset). */}
      <group position={[0, 0, 0.05]}>
        <PortalEffect radius={1.7} core="#e6ffb0" edge="#2f7d1a" />
      </group>

      {/* Ground mist — a faint additive green pool around the foot. */}
      <mesh position={[0, 0.04, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 48]} />
        <meshBasicMaterial color="#3aa01f" transparent opacity={0.13} depthWrite={false} blending={AdditiveBlending} />
      </mesh>

      {/* Skull at the foot, hollow eyes lit with rift-green. */}
      <group position={[0, 0.46, 0.62]} rotation={[0.15, 0, 0]}>
        {/* Crossed bones behind the skull — the classic skull-and-crossbones X.
            Set behind (−z) so the skull sits in front and the knobbed ends poke out. */}
        <group position={[0, -0.04, -0.16]} rotation={[0, 0, Math.PI / 4]}>
          <Bone />
        </group>
        <group position={[0, -0.04, -0.16]} rotation={[0, 0, -Math.PI / 4]}>
          <Bone />
        </group>
        <mesh castShadow>
          <sphereGeometry args={[0.22, 18, 18]} />
          <meshStandardMaterial color="#d8d2c0" roughness={0.6} metalness={0.05} emissive="#3a4030" emissiveIntensity={0.2} />
        </mesh>
        {/* Jaw. */}
        <mesh position={[0, -0.2, 0.03]} castShadow>
          <boxGeometry args={[0.26, 0.12, 0.2]} />
          <meshStandardMaterial {...BONE} />
        </mesh>
        {/* Glowing eye sockets. */}
        <mesh position={[-0.08, 0.03, 0.19]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#0a0f0a" emissive="#9bff5a" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        <mesh position={[0.08, 0.03, 0.19]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#0a0f0a" emissive="#9bff5a" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      </group>

      {/* Sickly-green glow on the stone + ground. */}
      <pointLight position={[0, 1.4, 0.4]} color="#7fe04a" intensity={7} distance={9} decay={2} />

      {/* Floating label — hidden while focused (the HUD shows the big title instead). */}
      {!focused && (
        <Billboard position={[0, 2.95, 0]}>
          <Text
            fontSize={0.34}
            color="#a6ff7f"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#0c1a0c"
          >
            The Breach
          </Text>
          <Text
            position={[0, -0.06, 0]}
            fontSize={0.16}
            color="#d8ffb0"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.012}
            outlineColor="#0c1a0c"
          >
            Co-op Survival
          </Text>
        </Billboard>
      )}

      {/* Invisible click volume covering the shrine. */}
      <mesh
        position={[0, 1.3, 0.2]}
        onPointerDown={open}
        onPointerOver={hover(true)}
        onPointerOut={hover(false)}
      >
        <boxGeometry args={[2.0, 2.8, 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </FadeGroup>
  );
}
