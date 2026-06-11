import { ARENA_HALF_SIZE } from '@arena/shared';

const SIZE = ARENA_HALF_SIZE * 2;
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.5;

// Gritty junkyard palette (matches the trailer-park props in assets/data/props).
const DIRT = '#5b4f3c';
const DIRT_DARK = '#3f3729';
const OIL = '#221d18';
const SCRAP = '#6f675b';
const SCRAP_DARK = '#474037';
const RUST = '#7c4a2f';
const POST = '#3a342c';

/** A dark, coplanar ground stain (oil spill / scorch). Uses polygonOffset so it
 *  layers on the dirt without z-fighting — same trick as the town's decals. */
function GroundStain({ x, z, r, color }: { x: number; z: number; r: number; color: string }) {
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[r, 20]} />
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        metalness={0.1}
        transparent
        opacity={0.55}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

/** One side of the perimeter: a corrugated-metal hoarding — rusted panels, a
 *  dark base strip, a top rail, and leaning posts. `horizontal` runs it along X
 *  (the ±Z walls); otherwise along Z (the ±X walls). */
function FenceWall({ x, z, length, horizontal }: { x: number; z: number; length: number; horizontal: boolean }) {
  const yaw = horizontal ? 0 : Math.PI / 2;
  const postCount = Math.round(length / 5);
  const posts = Array.from({ length: postCount + 1 }, (_, i) => -length / 2 + (i * length) / postCount);
  // A few rust patches scattered along the run for weathering.
  const patches = Array.from({ length: Math.round(length / 7) }, (_, i) => ({
    u: -length / 2 + length * ((i + 0.5) / Math.round(length / 7)),
    w: 1.6 + (i % 3) * 0.7,
    h: 0.7 + (i % 2) * 0.5,
    y: 0.7 + (i % 2) * 0.7,
  }));

  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* Corrugated panel run. */}
      <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={SCRAP} roughness={0.95} metalness={0.15} />
      </mesh>
      {/* Dark base strip (mud line). */}
      <mesh position={[0, 0.3, WALL_THICKNESS / 2 + 0.01]}>
        <boxGeometry args={[length, 0.6, 0.04]} />
        <meshStandardMaterial color={SCRAP_DARK} roughness={1} />
      </mesh>
      {/* Top rail. */}
      <mesh position={[0, WALL_HEIGHT + 0.08, 0]} castShadow>
        <boxGeometry args={[length, 0.16, WALL_THICKNESS + 0.12]} />
        <meshStandardMaterial color={SCRAP_DARK} roughness={0.9} metalness={0.2} />
      </mesh>
      {/* Rust patches. */}
      {patches.map((p, i) => (
        <mesh key={`r${i}`} position={[p.u, p.y, WALL_THICKNESS / 2 + 0.02]}>
          <boxGeometry args={[p.w, p.h, 0.04]} />
          <meshStandardMaterial color={RUST} roughness={1} />
        </mesh>
      ))}
      {/* Leaning support posts. */}
      {posts.map((u, i) => (
        <mesh
          key={`p${i}`}
          position={[u, WALL_HEIGHT / 2, WALL_THICKNESS / 2 + 0.12]}
          rotation={[i % 2 === 0 ? 0.04 : -0.03, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.18, WALL_HEIGHT + 0.5, 0.18]} />
          <meshStandardMaterial color={POST} roughness={0.9} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** Static arena geometry: a packed-dirt floor with oil stains and four rusted
 *  corrugated-metal hoardings around the perimeter — a fenced-in junkyard lot.
 *  Cover (trailers, cars, dumpsters, scrap) is placed as map props, not here. */
export function Arena() {
  const offset = ARENA_HALF_SIZE + WALL_THICKNESS / 2;

  return (
    <group>
      {/* Packed-dirt floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color={DIRT} roughness={1} metalness={0} />
      </mesh>

      {/* Worn, muddier patches + oil spills scattered across the lot. */}
      <GroundStain x={9} z={4} r={5} color={DIRT_DARK} />
      <GroundStain x={-9} z={-4} r={5} color={DIRT_DARK} />
      <GroundStain x={-4} z={9} r={4} color={DIRT_DARK} />
      <GroundStain x={4} z={-9} r={4} color={DIRT_DARK} />
      <GroundStain x={0} z={0} r={6} color={DIRT_DARK} />
      <GroundStain x={10} z={5} r={2.2} color={OIL} />
      <GroundStain x={-10} z={-5} r={2.2} color={OIL} />
      <GroundStain x={-5} z={-9} r={1.8} color={OIL} />
      <GroundStain x={5} z={9} r={1.8} color={OIL} />
      <GroundStain x={8} z={2} r={1.4} color={OIL} />
      <GroundStain x={-8} z={-2} r={1.4} color={OIL} />

      {/* Perimeter hoardings. */}
      <FenceWall x={0} z={offset} length={SIZE + WALL_THICKNESS * 2} horizontal />
      <FenceWall x={0} z={-offset} length={SIZE + WALL_THICKNESS * 2} horizontal />
      <FenceWall x={offset} z={0} length={SIZE} horizontal={false} />
      <FenceWall x={-offset} z={0} length={SIZE} horizontal={false} />
    </group>
  );
}
