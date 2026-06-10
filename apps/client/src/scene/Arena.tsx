import { Grid } from '@react-three/drei';
import { ARENA_HALF_SIZE } from '@arena/shared';

const SIZE = ARENA_HALF_SIZE * 2;
const WALL_HEIGHT = 1.5;
const WALL_THICKNESS = 0.5;

/** Static arena geometry: floor, grid overlay, and four bounding walls. */
export function Arena() {
  const offset = ARENA_HALF_SIZE + WALL_THICKNESS / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color="#1a1f33" roughness={0.95} metalness={0.05} />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        args={[SIZE, SIZE]}
        cellSize={1}
        cellColor="#2b3354"
        sectionSize={5}
        sectionColor="#3d4a7a"
        fadeDistance={SIZE * 1.5}
        infiniteGrid={false}
      />

      {(
        [
          [0, offset, SIZE + WALL_THICKNESS * 2, WALL_THICKNESS],
          [0, -offset, SIZE + WALL_THICKNESS * 2, WALL_THICKNESS],
          [offset, 0, WALL_THICKNESS, SIZE],
          [-offset, 0, WALL_THICKNESS, SIZE],
        ] as const
      ).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[w, WALL_HEIGHT, d]} />
          <meshStandardMaterial color="#3d4a7a" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
