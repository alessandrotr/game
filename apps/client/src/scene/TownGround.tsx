/**
 * Stylized town ground for the (larger, Britain-inspired) town.
 *
 * The grass is a single huge plane that runs far past the fog distance, so its
 * edge is never visible — the ground simply fades into the sky-coloured fog at
 * the horizon (no abrupt cutoff). A central stone plaza and packed-cobble
 * streets connect the spawn, the moongate/castle, and the blacksmith. A handful
 * of flat meshes at slightly stepped heights (no z-fighting) — cheap.
 */
const GRASS = '#4a6b3a';
const STREET = '#857a66';
const PLAZA = '#8e887b';
const PLAZA_RIM = '#6c675b';

export function TownGround() {
  return (
    <group>
      {/* Huge grass field — extends well beyond the fog so the horizon blends. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={GRASS} roughness={1} metalness={0} />
      </mesh>

      {/* Main street: spawn → well → moongate → castle gate (runs along z). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -4]} receiveShadow>
        <planeGeometry args={[5, 44]} />
        <meshStandardMaterial color={STREET} roughness={1} />
      </mesh>

      {/* East cross street → blacksmith. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8, 0.02, 5]} receiveShadow>
        <planeGeometry args={[18, 4]} />
        <meshStandardMaterial color={STREET} roughness={1} />
      </mesh>

      {/* West cross street → inn. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-8, 0.02, 2]} receiveShadow>
        <planeGeometry args={[18, 4]} />
        <meshStandardMaterial color={STREET} roughness={1} />
      </mesh>

      {/* Plaza rim (darker stone, slightly wider and lower). */}
      <mesh position={[0, 0.025, -2]}>
        <cylinderGeometry args={[8.4, 8.4, 0.05, 28]} />
        <meshStandardMaterial color={PLAZA_RIM} roughness={1} />
      </mesh>

      {/* Plaza floor (warm stone). */}
      <mesh position={[0, 0.04, -2]} receiveShadow>
        <cylinderGeometry args={[7.8, 7.8, 0.06, 28]} />
        <meshStandardMaterial color={PLAZA} roughness={0.95} />
      </mesh>
    </group>
  );
}
