import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import { useGameStore } from '../store/useGameStore';

/**
 * Lingering ground effects — the molotov's burning puddle, singularity vortex, or flux core overcharge.
 * Rendered as flat, animated discs sized EXACTLY to the zone's radius.
 * The server owns the simulation; the client animates and renders.
 */
function GroundZoneEntity({ id }: { id: string }) {
  const core = useRef<Mesh>(null);
  const swirl = useRef<Mesh>(null);
  const initial = useGameStore.getState().groundZones.get(id);

  useFrame((state) => {
    const z = useGameStore.getState().groundZones.get(id);
    if (!z) return;
    const tEl = state.clock.elapsedTime;

    if (z.kind === 'singularity') {
      // Swirling rotation in opposite directions for the vortex arms & core
      if (core.current) {
        core.current.rotation.z = -tEl * 2.5;
      }
      if (swirl.current) {
        swirl.current.rotation.z = tEl * 1.5;
      }
    } else if (z.kind === 'buff_core') {
      // High-energy rapid pulsation
      if (core.current) {
        const pulse = 0.45 + Math.sin(tEl * 15) * 0.15 + Math.sin(tEl * 7) * 0.08;
        (core.current.material as MeshBasicMaterial).opacity = Math.max(0.2, Math.min(0.8, pulse));
        
        const scale = 0.95 + Math.sin(tEl * 12) * 0.04;
        core.current.scale.set(scale, scale, 1);
      }
    } else {
      // Default molotov fire flicker
      if (core.current) {
        const flicker = 0.55 + Math.sin(tEl * 11) * 0.12 + Math.sin(tEl * 5) * 0.08;
        (core.current.material as MeshBasicMaterial).opacity = flicker;
      }
    }
  });

  if (!initial) return null;
  const r = initial.radius;

  if (initial.kind === 'singularity') {
    return (
      <group position={[initial.x, 0, initial.z]}>
        {/* Outer dark purple gravity well area */}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color="#2e1065" transparent opacity={0.6} depthWrite={false} />
        </mesh>
        {/* Swirling medium purple spiral/ring */}
        <mesh ref={swirl} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.3, r * 0.85, 40]} />
          <meshBasicMaterial color="#6b21a8" transparent opacity={0.65} depthWrite={false} />
        </mesh>
        {/* Center deep black core */}
        <mesh ref={core} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 0.5, 40]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  if (initial.kind === 'buff_core') {
    return (
      <group position={[initial.x, 0, initial.z]}>
        {/* Outer cyan energy boundary */}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color="#083344" transparent opacity={0.5} depthWrite={false} />
        </mesh>
        {/* Energy ring outline */}
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.2, r, 40]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        {/* Golden pulsing core */}
        <mesh ref={core} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 0.8, 40]} />
          <meshBasicMaterial color="#eab308" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Default: Molotov Fire
  return (
    <group position={[initial.x, 0, initial.z]}>
      {/* Outer scorch ring (full damage radius). */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial color="#7a2a08" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* Brighter flickering fire core. */}
      <mesh ref={core} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.82, 40]} />
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
