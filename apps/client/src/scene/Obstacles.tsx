import { ARENA_OBSTACLES } from '@arena/shared';

/** Renders the arena's collision obstacles (stone pillars) from shared data. */
export function Obstacles() {
  return (
    <>
      {ARENA_OBSTACLES.map((o, i) => (
        <group key={i} position={[o.x, 0, o.z]}>
          <mesh position={[0, o.height / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[o.radius, o.radius * 1.08, o.height, 20]} />
            <meshStandardMaterial color="#3b4252" roughness={0.92} metalness={0.05} />
          </mesh>
          {/* Cap. */}
          <mesh position={[0, o.height, 0]} castShadow>
            <cylinderGeometry args={[o.radius * 1.12, o.radius * 1.12, 0.25, 20]} />
            <meshStandardMaterial color="#4a5266" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </>
  );
}
