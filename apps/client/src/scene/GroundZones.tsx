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
  const groupRef = useRef<any>(null);
  const core = useRef<Mesh>(null);
  const swirl = useRef<Mesh>(null);
  const outerSwirl = useRef<Mesh>(null);
  const innerSwirl = useRef<Mesh>(null);
  const corona = useRef<Mesh>(null);
  const suction1 = useRef<Mesh>(null);
  const suction2 = useRef<Mesh>(null);
  const initial = useGameStore.getState().groundZones.get(id);

  useFrame((state) => {
    const z = useGameStore.getState().groundZones.get(id);
    if (!z) return;
    const tEl = state.clock.elapsedTime;

    if (groupRef.current && initial && initial.radius > 0) {
      const scale = z.radius / initial.radius;
      groupRef.current.scale.set(scale, 1, scale);
    }

    if (z.kind === 'singularity') {
      // Swirling rotations
      if (outerSwirl.current) {
        outerSwirl.current.rotation.z = tEl * 0.4;
      }
      if (swirl.current) {
        swirl.current.rotation.z = tEl * 1.5;
      }
      if (innerSwirl.current) {
        innerSwirl.current.rotation.z = -tEl * 2.8;
      }
      if (core.current) {
        core.current.rotation.z = -tEl * 0.8;
        // Central black horizon pulsates
        const scale = 1.0 + Math.sin(tEl * 8) * 0.05;
        core.current.scale.set(scale, scale, 1);
      }
      if (corona.current) {
        // Glowing pink/purple border expands and contracts
        const scale = 1.0 + Math.sin(tEl * 8 + Math.PI) * 0.08;
        corona.current.scale.set(scale, scale, 1);
        corona.current.rotation.z = tEl * 2.2;
      }

      // Suction rings scaling down over time to simulate inward gravity pull
      if (suction1.current) {
        const progress = (tEl * 0.5) % 1.0;
        const scale = 1.0 - progress;
        suction1.current.scale.set(scale, scale, 1);
        (suction1.current.material as MeshBasicMaterial).opacity = 0.5 * progress;
        suction1.current.rotation.z = tEl * 1.2;
      }
      if (suction2.current) {
        const progress = (tEl * 0.5 + 0.5) % 1.0;
        const scale = 1.0 - progress;
        suction2.current.scale.set(scale, scale, 1);
        (suction2.current.material as MeshBasicMaterial).opacity = 0.5 * progress;
        suction2.current.rotation.z = tEl * 1.2 + Math.PI;
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
        {/* Outer Accretion Disk matching the doubled gravity pull radius (2 * r) */}
        <mesh ref={outerSwirl} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.6, r * 2.0, 48]} />
          <meshBasicMaterial color="#1e1b4b" transparent opacity={0.45} depthWrite={false} />
        </mesh>
        
        {/* Suction rings moving inward */}
        <mesh ref={suction1} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.5, r * 2.0, 32]} />
          <meshBasicMaterial color="#4c1d95" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh ref={suction2} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.5, r * 2.0, 32]} />
          <meshBasicMaterial color="#4c1d95" transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Outer dark purple gravity well base area */}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color="#2e1065" transparent opacity={0.65} depthWrite={false} />
        </mesh>
        {/* Swirling medium purple spiral/ring */}
        <mesh ref={swirl} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.4, r * 0.9, 40]} />
          <meshBasicMaterial color="#6b21a8" transparent opacity={0.7} depthWrite={false} />
        </mesh>
        {/* Inner fast purple ring */}
        <mesh ref={innerSwirl} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.35, r * 0.7, 40]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        {/* Glowing neon pink/magenta corona */}
        <mesh ref={corona} position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.42, r * 0.52, 40]} />
          <meshBasicMaterial color="#db2777" transparent opacity={0.75} depthWrite={false} />
        </mesh>
        {/* Center deep black event horizon core */}
        <mesh ref={core} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 0.45, 40]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.98} depthWrite={false} />
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
    <group ref={groupRef} position={[initial.x, 0, initial.z]}>
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
