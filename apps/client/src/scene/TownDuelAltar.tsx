import { useEffect } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useLobbyStore } from '../store/useLobbyStore';
import { maybeFocusStructure, useFocusStore } from '../store/useFocusStore';
import { PortalEffect } from './PortalEffect';
import { FadeGroup } from './FadeGroup';

/**
 * "Trial of Blades" — the PvP duel shrine in town. Two crossed steel greatswords
 * planted in a war altar, backed by a swirling crimson battle-fury vortex.
 * Clicking it opens the matchmaking (lobby) browser, the same way the leaderboard
 * tablet opens the standings. Lives in the town scene only (mounted beside the
 * fountain), the west "action" counterpart to the east "standings" cluster
 * (leaderboard tablet + champion podiums).
 */

/** Polished-steel blade/fitting look — emissive-lifted so it never sinks to black
 *  under the dusk lighting. */
const STEEL = {
  color: '#cdd2dd',
  metalness: 0.85,
  roughness: 0.3,
  emissive: '#3a4252',
  emissiveIntensity: 0.3,
} as const;

/** Gold crossguard / pommel fittings. */
const BRASS = {
  color: '#d8b24a',
  metalness: 0.9,
  roughness: 0.3,
  emissive: '#5a4112',
  emissiveIntensity: 0.35,
} as const;

/** A greatsword standing point-up, hilt planted in the altar. `tilt` leans it so
 *  the pair crosses in an X. */
function Sword({ tilt }: { tilt: number }) {
  return (
    <group rotation={[0, 0, tilt]}>
      {/* Blade. */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.1, 1.6, 0.03]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      {/* Blade tip. */}
      <mesh position={[0, 1.86, 0]} castShadow>
        <coneGeometry args={[0.055, 0.2, 4]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      {/* Crossguard. */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.09]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      {/* Grip. */}
      <mesh position={[0, 0.0, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.32, 12]} />
        <meshStandardMaterial color="#3a2a1a" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Pommel. */}
      <mesh position={[0, -0.18, 0]} castShadow>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
    </group>
  );
}

interface TownDuelAltarProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function TownDuelAltar({
  // West side of the plaza, mirroring the leaderboard tablet on the east.
  position = [-7, 0, -3],
  rotation = [0, 0.7, 0],
}: TownDuelAltarProps) {
  // Restore the cursor on unmount so it never sticks as a pointer.
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  // Hide the 3D floating label while focused; fade the whole shrine out when a
  // DIFFERENT structure is focused.
  const focused = useFocusStore((s) => s.panel === 'pvp' && !!s.target);
  const show = useFocusStore((s) => !s.target || s.panel === 'pvp');

  const open = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return; // left-click only
    e.stopPropagation();
    useLobbyStore.getState().setMenuOpen(true);
    maybeFocusStructure('pvp', 'Trial of Blades', rotation[1], position[0], 0, position[2]);
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? 'pointer' : '';
  };

  return (
    <FadeGroup show={show} position={position} rotation={rotation}>
      {/* Stepped war altar — dark warm stone. */}
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.3, 0.3, 1.5]} />
        <meshStandardMaterial color="#46414e" roughness={0.7} metalness={0.2} emissive="#1f1820" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.8, 0.45, 1.2]} />
        <meshStandardMaterial color="#4e4753" roughness={0.65} metalness={0.25} emissive="#241a22" emissiveIntensity={0.32} />
      </mesh>
      <mesh position={[0, 0.82, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.2, 1.0]} />
        <meshStandardMaterial color="#564d5b" roughness={0.6} metalness={0.3} emissive="#2a1e26" emissiveIntensity={0.35} />
      </mesh>

      {/* Swirling crimson battle-fury vortex, behind the crossed blades. */}
      <group position={[0, 0.55, -0.18]}>
        <PortalEffect radius={0.62} core="#ffd27a" edge="#c01818" />
      </group>

      {/* Crossed greatswords planted on the top slab. */}
      <group position={[0, 0.92, 0.12]}>
        <Sword tilt={0.42} />
        <Sword tilt={-0.42} />
      </group>

      {/* Warm glow cast on the altar + ground. */}
      <pointLight position={[0, 1.4, 0.35]} color="#ff5030" intensity={7} distance={9} decay={2} />

      {/* Floating label — hidden while focused (the HUD shows the big title instead). */}
      {!focused && (
        <Billboard position={[0, 2.85, 0]}>
          <Text
            fontSize={0.34}
            color="#ff8a5a"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#1a0a06"
          >
            Trial of Blades
          </Text>
          <Text
            position={[0, -0.06, 0]}
            fontSize={0.16}
            color="#ffcf8a"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.012}
            outlineColor="#1a0a06"
          >
            Player Duels
          </Text>
        </Billboard>
      )}

      {/* Invisible click volume covering the shrine. */}
      <mesh
        position={[0, 1.3, 0.1]}
        onPointerDown={open}
        onPointerOver={hover(true)}
        onPointerOut={hover(false)}
      >
        <boxGeometry args={[2.4, 2.8, 1.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </FadeGroup>
  );
}
