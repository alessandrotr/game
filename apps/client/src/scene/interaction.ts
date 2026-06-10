import type { NpcInstance } from '../assets/data/npcs';

/**
 * Pure interaction helpers (Phase 8.3). Kept free of React/Three so the
 * proximity rule is trivially unit-testable; the `Npcs` layer calls
 * `nearestInteractable` each frame with the player's position.
 */

/** The closest NPC whose interaction radius contains (px, pz), or null. */
export function nearestInteractable(
  px: number,
  pz: number,
  npcs: readonly NpcInstance[],
): NpcInstance | null {
  let best: NpcInstance | null = null;
  let bestDistSq = Infinity;
  for (const npc of npcs) {
    const dx = npc.position[0] - px;
    const dz = npc.position[2] - pz;
    const distSq = dx * dx + dz * dz;
    const r = npc.interactionRadius;
    if (distSq <= r * r && distSq < bestDistSq) {
      best = npc;
      bestDistSq = distSq;
    }
  }
  return best;
}
