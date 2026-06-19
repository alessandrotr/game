/**
 * The 3D look of a pickable object (molotov / grenade), shared by every place one
 * appears: resting on the ground, carried over a player's head, and tumbling in
 * flight. Low-poly primitives, matching the arena's weathered palette.
 */

/** A molotov: a green-glass bottle with a lit rag stuffed in the neck. */
function Molotov() {
  return (
    <group>
      {/* Bottle body */}
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.4, 12]} />
        <meshStandardMaterial color="#3f6b32" roughness={0.3} metalness={0.1} transparent opacity={0.85} />
      </mesh>
      {/* Neck */}
      <mesh castShadow position={[0, 0.46, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 0.14, 10]} />
        <meshStandardMaterial color="#34552a" roughness={0.35} />
      </mesh>
      {/* Burning rag */}
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#ff8a2a" emissive="#ff6a00" emissiveIntensity={2.2} />
      </mesh>
    </group>
  );
}

/** A grenade: a dark olive ovoid body with a metal cap + lever. */
function Grenade() {
  return (
    <group>
      <mesh castShadow position={[0, 0.22, 0]} scale={[1, 1.2, 1]}>
        <sphereGeometry args={[0.2, 14, 12]} />
        <meshStandardMaterial color="#3b4a2a" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Top cap */}
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.1, 10]} />
        <meshStandardMaterial color="#6b6b6b" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Safety lever */}
      <mesh position={[0.1, 0.42, 0]}>
        <boxGeometry args={[0.16, 0.03, 0.05]} />
        <meshStandardMaterial color="#8a8a8a" roughness={0.4} metalness={0.7} />
      </mesh>
    </group>
  );
}

/** A heal pack: a green cross formed by two intersecting boxes. */
function HealPack() {
  return (
    <group>
      {/* Horizontal bar of the cross */}
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.5, 0.16, 0.16]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.5} roughness={0.4} />
      </mesh>
      {/* Vertical bar of the cross */}
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.16, 0.5, 0.16]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Render a pickable's mesh by kind (anything unknown renders nothing). */
export function PickableVisual({ kind }: { kind: string }) {
  if (kind === 'molotov') return <Molotov />;
  if (kind === 'grenade') return <Grenade />;
  if (kind === 'heal_pack') return <HealPack />;
  return null;
}
