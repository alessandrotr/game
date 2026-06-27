import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  ALTAR_ASSET_ID,
  ALTAR_GEM_COUNT,
  ALTAR_HEIGHT,
  ALTAR_POSITION,
  ALTAR_RITUAL_RADIUS,
  DEFAULT_ARENA_SEED,
  generateRoomLayout,
  trapForSection,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/** Gem color mappings based on the trap type. */
const TRAP_GEM_COLORS: Record<string, string> = {
  heal: '#3ef07a',
  death: '#ff4d4d',
  singularity: '#b15bff',
  buff: '#4da6ff',
};
/** How far the gem sockets orbit the obelisk base. */
const GEM_ORBIT = 1.7;

/**
 * Resonance of the Void — the Altar of Resonance at the room centre (zombie mode,
 * wave 13+). A dark obelisk ringed by four gem sockets that light as traps fire
 * (server tracks which traps fired in the bitmask `altarGemsLit`); a glowing ritual ring marks the
 * radius the channeller must stand in. The server owns the collision (an
 * indestructible CoverStructure); this is purely the visual. Renders only once
 * that structure exists, so it appears exactly when the altar rises.
 */
export function AltarOfResonance() {
  const seed = useGameStore((s) => s.arenaSeed) || DEFAULT_ARENA_SEED;

  // Re-render when the set of structures changes — that's when the altar spawns.
  const structureIds = useGameStore((s) => s.structureIds);
  const hasAltar = useMemo(() => {
    const structures = useGameStore.getState().structures;
    for (const id of structureIds) {
      if (structures.get(id)?.assetId === ALTAR_ASSET_ID) return true;
    }
    return false;
  }, [structureIds]);

  const lit = useGameStore((s) => s.altarGemsLit);
  const complete = (lit & 15) === 15;

  // Get the trap kinds for all 4 sections in order based on the layout seed.
  const trapKinds = useMemo(() => {
    const layout = generateRoomLayout(seed);
    return layout.sections.map((section) => trapForSection(seed, section)?.kind ?? 'heal');
  }, [seed]);

  // Slow idle spin on the gem ring so the altar reads as "active".
  const ring = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.y += dt * 0.4;
  });

  if (!hasAltar) return null;

  return (
    <group position={[ALTAR_POSITION.x, 0, ALTAR_POSITION.z]}>
      {/* Obelisk: a dark tapered prism. */}
      <mesh position={[0, ALTAR_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.5, 1.1, ALTAR_HEIGHT, 4]} />
        <meshStandardMaterial color="#15131c" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Glowing ritual ring on the ground — the radius the channeller stands in. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[ALTAR_RITUAL_RADIUS - 0.18, ALTAR_RITUAL_RADIUS, 64]} />
        <meshBasicMaterial color={complete ? '#b15bff' : '#3a3550'} transparent opacity={0.7} />
      </mesh>

      {/* Four gem sockets around the base; color matches the corresponding section's trap. */}
      <group ref={ring}>
        {Array.from({ length: ALTAR_GEM_COUNT }).map((_, i) => {
          const angle = (i / ALTAR_GEM_COUNT) * Math.PI * 2;
          const gx = Math.sin(angle) * GEM_ORBIT;
          const gz = Math.cos(angle) * GEM_ORBIT;
          const isLit = (lit & (1 << i)) !== 0;
          const trapKind = trapKinds[i] ?? 'heal';
          const color = TRAP_GEM_COLORS[trapKind] ?? '#ffffff';
          return (
            <mesh key={i} position={[gx, 0.9, gz]}>
              <octahedronGeometry args={[0.28]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isLit ? 2.4 : 0.04}
                metalness={0.3}
                roughness={0.2}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
