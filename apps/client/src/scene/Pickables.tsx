import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useGameStore } from '../store/useGameStore';
import { PickableVisual } from './PickableVisual';

/**
 * Loose pickable objects (molotov / grenade) resting on the ground, dropped by
 * destroyed oil drums. Each gently bobs and spins with a glowing ground ring so it
 * reads as "walk over and grab me" (instant/auto-pickup). Positions are static once spawned,
 * so the per-frame work is just the idle flourish.
 */
function PickableEntity({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const initial = useGameStore.getState().pickables.get(id);

  useFrame((state) => {
    const node = group.current;
    const p = useGameStore.getState().pickables.get(id);
    if (!node || !p) return;
    const t = state.clock.elapsedTime;
    node.position.set(p.x, p.y + Math.sin(t * 2.4) * 0.08, p.z);
    node.rotation.y = t * 1.2;
  });

  if (!initial) return null;
  const scale = initial.scale ?? 1;
  const ringColor = initial.kind === 'heal_pack' ? '#22c55e' : '#ffd761';
  const isHeal = initial.kind === 'heal_pack';
  const innerR = isHeal ? 0.9 : 0.45;
  const outerR = isHeal ? 1.24 : 0.62;
  return (
    <group ref={group} position={[initial.x, initial.y, initial.z]} scale={[scale, scale, scale]}>
      <PickableVisual kind={initial.kind} />
      {/* Glow ring on the ground marking it as grabbable. */}
      <mesh position={[0, -initial.y + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 16]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Renders all loose pickables, mounting/unmounting on spawn/grab/despawn. */
export function Pickables() {
  const ids = useGameStore((s) => s.pickableIds);
  return (
    <>
      {ids.map((id) => (
        <PickableEntity key={id} id={id} />
      ))}
    </>
  );
}
