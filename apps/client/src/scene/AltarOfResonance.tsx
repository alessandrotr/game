import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  ALTAR_ASSET_ID,
  ALTAR_GEM_COUNT,
  ALTAR_HEIGHT,
  ALTAR_POSITION,
  ALTAR_RITUAL_RADIUS,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/** Flavor colors per socket (heal / death / singularity / buff). Gems light in
 *  order by COUNT — kind doesn't matter — but the colors keep the doc's look. */
const GEM_COLORS = ['#3ef07a', '#ff4d4d', '#b15bff', '#4da6ff'];
/** How far the gem sockets orbit the obelisk base. */
const GEM_ORBIT = 1.7;

/**
 * Resonance of the Void — the Altar of Resonance at the room centre (zombie mode,
 * wave 13+). A dark obelisk ringed by four gem sockets that light as traps fire
 * (server tracks the count in `altarGemsLit`); a glowing ritual ring marks the
 * radius the channeller must stand in. The server owns the collision (an
 * indestructible CoverStructure); this is purely the visual. Renders only once
 * that structure exists, so it appears exactly when the altar rises.
 */
export function AltarOfResonance() {
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
  const complete = lit >= ALTAR_GEM_COUNT;

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

      {/* Four gem sockets around the base; light in order as gems are earned. */}
      <group ref={ring}>
        {Array.from({ length: ALTAR_GEM_COUNT }).map((_, i) => {
          const angle = (i / ALTAR_GEM_COUNT) * Math.PI * 2;
          const gx = Math.sin(angle) * GEM_ORBIT;
          const gz = Math.cos(angle) * GEM_ORBIT;
          const isLit = i < lit;
          const color = GEM_COLORS[i % GEM_COLORS.length] ?? '#ffffff';
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
