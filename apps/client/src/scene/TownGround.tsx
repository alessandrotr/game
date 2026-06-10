import { Grid } from '@react-three/drei';
import { TOWN_HALF_SIZE } from '@arena/shared';

const SIZE = TOWN_HALF_SIZE * 2;

/** The town's open ground (no arena walls): a grassy floor + a soft grid. */
export function TownGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color="#2a3a1e" roughness={0.97} metalness={0.04} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[SIZE, SIZE]}
        cellSize={2}
        cellColor="#3a4a2a"
        sectionSize={10}
        sectionColor="#52603a"
        fadeDistance={SIZE * 1.4}
        infiniteGrid={false}
      />
    </group>
  );
}
