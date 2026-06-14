import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import { useGameStore } from '../store/useGameStore';

/**
 * Lingering ground effects — the molotov's burning puddle. Rendered as a flat,
 * flickering fire-coloured disc sized EXACTLY to the zone's damage radius (the
 * visual is the hit area), with an inner brighter core. The server owns the
 * periodic damage and the zone's lifetime; the disc disappears when the entity
 * leaves replicated state.
 */
function GroundZoneEntity({ id }: { id: string }) {
  const core = useRef<Mesh>(null);
  const initial = useGameStore.getState().groundZones.get(id);

  useFrame((state) => {
    const z = useGameStore.getState().groundZones.get(id);
    if (!z || !core.current) return;
    // Flicker the core's brightness so the fire reads as alive.
    const flicker = 0.55 + Math.sin(state.clock.elapsedTime * 11) * 0.12 + Math.sin(state.clock.elapsedTime * 5) * 0.08;
    (core.current.material as MeshBasicMaterial).opacity = flicker;
  });

  if (!initial) return null;
  return (
    <group position={[initial.x, 0, initial.z]}>
      {/* Outer scorch ring (full damage radius). */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[initial.radius, 40]} />
        <meshBasicMaterial color="#7a2a08" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* Brighter flickering fire core. */}
      <mesh ref={core} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[initial.radius * 0.82, 40]} />
        <meshBasicMaterial color="#ff7b1a" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Renders all active ground zones, mounting/unmounting on spawn/expire. */
export function GroundZones() {
  const ids = useGameStore((s) => s.groundZoneIds);
  return (
    <>
      {ids.map((id) => (
        <GroundZoneEntity key={id} id={id} />
      ))}
    </>
  );
}
