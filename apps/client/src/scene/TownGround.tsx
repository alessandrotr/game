/**
 * Stylized town ground for the (larger, Britain-inspired) town.
 *
 * The streets and central plaza are painted directly into the grass ground's
 * shader (see `GrassGround`) rather than as separate decal meshes. That means
 * there's a single opaque ground surface — nothing coplanar to z-fight, no decal
 * sitting above y=0 to clip the player's feet, and nothing to overdraw the arena
 * portal. One cheap plane carries the whole ground (the 26k animated grass blades
 * were removed — they were the heaviest always-on cost on weak GPUs).
 */
import { GrassGround } from './GrassGround';

export function TownGround() {
  return (
    <group>
      <GrassGround />
    </group>
  );
}
