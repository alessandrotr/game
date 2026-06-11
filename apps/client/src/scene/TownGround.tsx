/**
 * Stylized town ground for the (larger, Britain-inspired) town.
 *
 * Everything is drawn flat at y = 0 — the same plane the player's feet rest on —
 * so the plaza/streets never sit *above* ground and clip the player's ankles.
 * Coplanar surfaces are layered with `polygonOffset` (a depth bias) instead of a
 * physical height, so there's no z-fighting and no "swallowed feet". The grass
 * is a single huge plane that runs far past the fog, so the horizon blends.
 */
import { GrassGround } from './GrassGround';
import { GrassBlades } from './GrassBlades';

const STREET = '#857a66';
const PLAZA = '#8e887b';
const PLAZA_RIM = '#6c675b';

/** Coplanar decal that renders above the grass without z-fighting. */
function GroundDecal({
  children,
  color,
  order,
  receiveShadow = true,
}: {
  children: React.ReactNode;
  color: string;
  order: number;
  receiveShadow?: boolean;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={receiveShadow}>
      {children}
      <meshStandardMaterial
        color={color}
        roughness={1}
        polygonOffset
        polygonOffsetFactor={-order}
        polygonOffsetUnits={-order}
      />
    </mesh>
  );
}

export function TownGround() {
  return (
    <group>
      {/* Huge grass field (shader-enriched) — extends past the fog so the horizon
          blends. Keeps PBR lighting + shadows; adds grass variation, wind, and a
          subtle disturbance that follows the moving player. */}
      <GrassGround />
      {/* Real 3D blades over the active town centre for tall-grass silhouettes. */}
      <GrassBlades />

      {/* Streets (flat at y=0), positioned in world space by the parent group. */}
      <group position={[0, 0, -4]}>
        <GroundDecal color={STREET} order={1}>
          <planeGeometry args={[5, 44]} />
        </GroundDecal>
      </group>
      <group position={[8, 0, 5]}>
        <GroundDecal color={STREET} order={1}>
          <planeGeometry args={[18, 4]} />
        </GroundDecal>
      </group>
      <group position={[-8, 0, 2]}>
        <GroundDecal color={STREET} order={1}>
          <planeGeometry args={[18, 4]} />
        </GroundDecal>
      </group>

      {/* Central plaza: rim then floor, layered above the streets. */}
      <group position={[0, 0, -2]}>
        <GroundDecal color={PLAZA_RIM} order={2}>
          <circleGeometry args={[8.4, 48]} />
        </GroundDecal>
        <GroundDecal color={PLAZA} order={3}>
          <circleGeometry args={[7.8, 48]} />
        </GroundDecal>
      </group>
    </group>
  );
}
