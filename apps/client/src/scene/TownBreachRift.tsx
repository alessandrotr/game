import { useEffect } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { AdditiveBlending } from 'three';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { PortalEffect } from './PortalEffect';

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

  const open = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return; // left-click only
    e.stopPropagation();
    useZombieLobbyStore.getState().setMenuOpen(true);
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? 'pointer' : '';
  };

  return (
    <group position={position} rotation={rotation}>
      {/* Plinth. */}
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.0, 0.25, 1.2]} />
        <meshStandardMaterial color="#34402f" roughness={0.9} metalness={0.1} emissive="#101a10" emissiveIntensity={0.35} />
      </mesh>

      {/* Cracked monolith — two halves leaning apart, the rift glowing through. */}
      <group position={[-0.46, 1.3, 0]} rotation={[0, 0, 0.05]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.7, 2.2, 0.42]} />
          <meshStandardMaterial {...TOMB} />
        </mesh>
      </group>
      <group position={[0.46, 1.3, 0]} rotation={[0, 0, -0.05]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.7, 2.2, 0.42]} />
          <meshStandardMaterial {...TOMB} />
        </mesh>
      </group>

      {/* Necrotic rift swirling in the fracture. */}
      <group position={[0, 0.5, 0.05]}>
        <PortalEffect radius={0.55} core="#e6ffb0" edge="#2f7d1a" />
      </group>

      {/* Ground mist — a faint additive green pool around the foot. */}
      <mesh position={[0, 0.04, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 48]} />
        <meshBasicMaterial color="#3aa01f" transparent opacity={0.13} depthWrite={false} blending={AdditiveBlending} />
      </mesh>

      {/* Skull at the foot, hollow eyes lit with rift-green. */}
      <group position={[0, 0.46, 0.62]} rotation={[0.15, 0, 0]}>
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

      {/* Crossed bones beside the skull. */}
      <mesh position={[0.5, 0.18, 0.55]} rotation={[0, 0.5, 1.4]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.6, 8]} />
        <meshStandardMaterial {...BONE} />
      </mesh>
      <mesh position={[0.5, 0.18, 0.55]} rotation={[0, -0.5, 1.4]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.6, 8]} />
        <meshStandardMaterial {...BONE} />
      </mesh>

      {/* Sickly-green glow on the stone + ground. */}
      <pointLight position={[0, 1.4, 0.4]} color="#7fe04a" intensity={7} distance={9} decay={2} />

      {/* Floating label. */}
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
    </group>
  );
}
