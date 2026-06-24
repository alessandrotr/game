import { type ReactElement } from 'react';

/**
 * A real-looking arrow: brown wooden shaft, a steel broadhead, a dark nock, and
 * three feather fletchings at the back. Modeled pointing down the +Z axis with
 * its nock at the local origin (so callers can sit the nock on the bowstring).
 */
export function WoodArrow(): ReactElement {
  return (
    <group>
      {/* wooden shaft */}
      <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.009, 0.009, 0.6, 6]} />
        <meshStandardMaterial color="#6b4a2b" roughness={0.85} metalness={0} />
      </mesh>
      {/* steel broadhead */}
      <mesh position={[0, 0, 0.66]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.02, 0.09, 6]} />
        <meshStandardMaterial color="#aab0ba" roughness={0.35} metalness={0.6} />
      </mesh>
      {/* nock */}
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.04, 6]} />
        <meshStandardMaterial color="#2e2118" roughness={0.7} />
      </mesh>
      {/* three feather fletchings spaced 120° around the shaft */}
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, 0, (i * 2 * Math.PI) / 3]}>
          <mesh position={[0, 0.03, 0.1]}>
            <boxGeometry args={[0.0015, 0.05, 0.14]} />
            <meshStandardMaterial color="#d8d0c0" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
