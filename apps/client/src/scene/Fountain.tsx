import { DoubleSide } from 'three';
import { WaterSurface } from './WaterSurface';
import { WaterStream } from './WaterStream';

/**
 * A large tiered town fountain: a hollow stone basin with a rippling pool, a
 * central column carrying a raised bowl (also pooled), falling-water streams
 * between the tiers, and a finial. The basins are open-ended cylinder walls
 * (capped with a torus rim) so the water sits visibly recessed inside — a solid
 * cylinder would hide the pool under its top face. Water is the `WaterSurface`
 * shader; the stonework is matte so it lights/shadows like the rest of town.
 *
 * Modeled around the origin (base on the ground); place it with `position`.
 */

const STONE = '#8d8880';
const STONE_DARK = '#5f5b54';
const STONE_BASIN = '#6b665e';

// Team-split water: blue on the left (x<0), red on the right (x>0). The fountain
// sits at the town centre (x=0), so the seam lands exactly on the divide.
const RED_DEEP = '#4d1216';
const RED_SHALLOW = '#c43f3f';
const STREAM_RIGHT = '#ffb3b3';

export function Fountain({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Stepped base. */}
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[3.2, 3.45, 0.3, 56]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.95} metalness={0} />
      </mesh>

      {/* Basin: hollow wall (open-ended) + rounded rim + floor + pool. */}
      <mesh position={[0, 0.55, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[3.0, 3.0, 0.75, 56, 1, true]} />
        <meshStandardMaterial color={STONE} roughness={0.9} metalness={0} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[3.0, 0.14, 12, 56]} />
        <meshStandardMaterial color={STONE} roughness={0.85} metalness={0} />
      </mesh>
      <mesh position={[0, 0.24, 0]} receiveShadow>
        <cylinderGeometry args={[2.95, 2.95, 0.1, 56]} />
        <meshStandardMaterial color={STONE_BASIN} roughness={1} metalness={0} />
      </mesh>
      <WaterSurface radius={2.85} position={[0, 0.82, 0]} redDeep={RED_DEEP} redShallow={RED_SHALLOW} />

      {/* Central column. */}
      <mesh position={[0, 1.42, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.42, 0.55, 1.25, 24]} />
        <meshStandardMaterial color={STONE} roughness={0.9} metalness={0} />
      </mesh>

      {/* Raised bowl: same hollow construction, smaller. */}
      <mesh position={[0, 2.0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.1, 0.85, 0.34, 36, 1, true]} />
        <meshStandardMaterial color={STONE} roughness={0.9} metalness={0} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 2.17, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[1.1, 0.1, 10, 36]} />
        <meshStandardMaterial color={STONE} roughness={0.85} metalness={0} />
      </mesh>
      <mesh position={[0, 1.9, 0]}>
        <cylinderGeometry args={[1.04, 1.04, 0.06, 36]} />
        <meshStandardMaterial color={STONE_BASIN} roughness={1} metalness={0} />
      </mesh>
      <WaterSurface radius={1.0} position={[0, 2.08, 0]} redDeep={RED_DEEP} redShallow={RED_SHALLOW} />

      {/* Finial stem + cap. */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.16, 0.46, 16]} />
        <meshStandardMaterial color={STONE} roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 2.72, 0]} castShadow>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial color={STONE} roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Falling water spilling from the raised bowl rim down into the pool —
          an animated veil that breaks into downward-flowing streams. */}
      <WaterStream
        radiusTop={1.04}
        radiusBottom={1.16}
        height={1.16}
        position={[0, 1.42, 0]}
        colorRight={STREAM_RIGHT}
      />
    </group>
  );
}
