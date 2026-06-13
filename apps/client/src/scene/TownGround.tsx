/**
 * Stylized town ground for the (larger, Britain-inspired) town.
 *
 * The streets and central plaza are painted directly into the grass ground's
 * shader (see `GrassGround`) rather than as separate decal meshes. That means
 * there's a single opaque ground surface — nothing coplanar to z-fight, no decal
 * sitting above y=0 to clip the player's feet, and nothing to overdraw the arena
 * portal. The grass is one huge plane that runs far past the fog so the horizon
 * blends, with real 3D blades forming a tall-grass wall around the edge.
 */
import { GrassGround } from './GrassGround';
import { GrassBlades } from './GrassBlades';

export function TownGround() {
  return (
    <group>
      <GrassGround />
      <GrassBlades />
    </group>
  );
}
