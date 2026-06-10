import { TOWN_HALF_SIZE } from '@arena/shared';

const SIZE = TOWN_HALF_SIZE * 2;

/**
 * Stylized town ground: a grassy field with a stone plaza at the centre and
 * packed-dirt paths running to the arena gate and the blacksmith. A few flat
 * meshes at slightly stepped heights (no z-fighting) — cheap, and far more
 * "town" than the old debug grid.
 */
export function TownGround() {
  return (
    <group>
      {/* Grass field. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color="#4a6b3a" roughness={1} metalness={0} />
      </mesh>

      {/* Main path: spawn → well → arena gate (runs along z). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -1]} receiveShadow>
        <planeGeometry args={[4.6, 28]} />
        <meshStandardMaterial color="#7a6244" roughness={1} />
      </mesh>

      {/* Cross path: plaza → blacksmith (east). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6, 0.02, 4]} receiveShadow>
        <planeGeometry args={[16, 3.6]} />
        <meshStandardMaterial color="#7a6244" roughness={1} />
      </mesh>

      {/* Plaza rim (darker stone, slightly wider and lower). */}
      <mesh position={[0, 0.025, -2]}>
        <cylinderGeometry args={[7.6, 7.6, 0.05, 28]} />
        <meshStandardMaterial color="#6c675b" roughness={1} />
      </mesh>

      {/* Plaza floor (warm stone). */}
      <mesh position={[0, 0.04, -2]} receiveShadow>
        <cylinderGeometry args={[7, 7, 0.06, 28]} />
        <meshStandardMaterial color="#8e887b" roughness={0.95} />
      </mesh>
    </group>
  );
}
