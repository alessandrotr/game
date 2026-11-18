import type { MapDescriptor } from '@arena/shared';
import { ARENA_HALF_SIZE, TOWN_HALF_SIZE } from '@arena/shared';

/**
 * Maps are pure data: a ground spec, a list of instances placed by asset id, and
 * semantic zones laid out by the builders (Phase 8). Interactable NPCs live in
 * the NPC system (`assets/data/npcs.ts`), not in `props`, so their look,
 * placement, and dialogue stay together.
 */

const PORTAL_Z = -ARENA_HALF_SIZE + 2;
const HALF_PI = Math.PI / 2;

const arena: MapDescriptor = {
  id: 'map.arena',
  displayName: 'The Arena',
  halfSize: ARENA_HALF_SIZE,
  groundColor: '#6a6353',
  ambient: { color: '#6a6452', intensity: 0.45 },
  // A ruined keep courtyard. The big pieces (stone ruins, wrecked wagons,
  // supply crates, rubble heaps, keg clusters) are cover and line up 1:1 with
  // the collision circles in ARENA_LAYOUTS.trailerpark (packages/shared) — keep
  // the two in sync. Everything else (rubble, debris, cartwheels, palisades,
  // broken crates, kegs/braziers) is decorative scatter for a lived-in feel.
  props: [
    // --- Cover (matches trailerpark collision circles) ---
    { assetId: 'prop.building.shack', position: [10, 0, 5], rotation: [0, -0.5, 0] },
    { assetId: 'prop.building.shack', position: [-10, 0, -5], rotation: [0, 2.64, 0] },
    { assetId: 'prop.building.shack.small', position: [-11, 0, 8], rotation: [0, 0.6, 0] },
    { assetId: 'prop.building.shack.small', position: [11, 0, -8], rotation: [0, -2.54, 0] },
    { assetId: 'prop.arena.car.burned', position: [-5, 0, -9], rotation: [0, 0.4, 0] },
    { assetId: 'prop.arena.car.burned', position: [5, 0, 9], rotation: [0, 3.54, 0] },
    { assetId: 'prop.arena.dumpster', position: [15, 0, -2], rotation: [0, -1, 0] },
    { assetId: 'prop.arena.dumpster', position: [-15, 0, 2], rotation: [0, 2.14, 0] },
    { assetId: 'prop.arena.scrap', position: [2, 0, 4], rotation: [0, 0.5, 0] },
    { assetId: 'prop.arena.scrap', position: [-2, 0, -4], rotation: [0, 3.64, 0] },
    // Drum clusters (each huddle sits inside one r1.1 collision circle).
    { assetId: 'prop.arena.drum', position: [0, 0, 12] },
    { assetId: 'prop.arena.drum', position: [0.55, 0, 12.35], rotation: [0, 0.6, 0] },
    { assetId: 'prop.arena.drum', position: [-0.5, 0, 11.6], rotation: [0, 1.2, 0] },
    { assetId: 'prop.arena.drum', position: [0, 0, -12] },
    { assetId: 'prop.arena.drum', position: [-0.55, 0, -12.35], rotation: [0, 0.6, 0] },
    { assetId: 'prop.arena.drum', position: [0.5, 0, -11.6], rotation: [0, 1.2, 0] },

    // --- Burning barrels (atmosphere; keep in sync with scene/ArenaLights) ---
    { assetId: 'prop.arena.drum.fire', position: [8, 0, 2] },
    { assetId: 'prop.arena.drum.fire', position: [-8, 0, -2] },
    { assetId: 'prop.arena.drum.fire', position: [14, 0, 10] },
    { assetId: 'prop.arena.drum.fire', position: [-14, 0, -10] },

    // --- Loose drums leaning against the cover ---
    { assetId: 'prop.arena.drum', position: [12, 0, 6], rotation: [0, 0.3, 0] },
    { assetId: 'prop.arena.drum', position: [-12, 0, -6], rotation: [0, 0.9, 0] },

    // --- Tyre stacks ---
    { assetId: 'prop.arena.tires', position: [9, 0, -4] },
    { assetId: 'prop.arena.tires', position: [-9, 0, 4] },
    { assetId: 'prop.arena.tires', position: [-12, 0, 11] },
    { assetId: 'prop.arena.tires', position: [12, 0, -11] },

    // --- Trash piles ---
    { assetId: 'prop.arena.trash', position: [12, 0, -4] },
    { assetId: 'prop.arena.trash', position: [-12, 0, 4] },
    { assetId: 'prop.arena.trash', position: [4, 0, 13] },
    { assetId: 'prop.arena.trash', position: [-4, 0, -13] },
    { assetId: 'prop.arena.trash', position: [17, 0, -6] },
    { assetId: 'prop.arena.trash', position: [-17, 0, 6] },





    // --- Broken yard fences (decorative runs) ---
    { assetId: 'prop.arena.fence.rust', position: [7, 0, -12] },
    { assetId: 'prop.arena.fence.rust', position: [9, 0, -12] },
    { assetId: 'prop.arena.fence.rust', position: [11, 0, -11.9], rotation: [0, 0.12, 0] },
    { assetId: 'prop.arena.fence.rust', position: [-7, 0, 12] },
    { assetId: 'prop.arena.fence.rust', position: [-9, 0, 12] },
    { assetId: 'prop.arena.fence.rust', position: [-11, 0, 11.9], rotation: [0, 0.12, 0] },
    { assetId: 'prop.arena.fence.rust', position: [-17, 0, 8], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.arena.fence.rust', position: [-17, 0, 10], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.arena.fence.rust', position: [17, 0, -8], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.arena.fence.rust', position: [17, 0, -10], rotation: [0, HALF_PI, 0] },
  ],
  zones: [
    { kind: 'portal', center: [0, 0, PORTAL_Z], radius: 2.2, label: 'Town Portal' },
    { kind: 'spawn', center: [0, 0, 18], radius: 2, label: 'Spawn' },
    { kind: 'spawn', center: [0, 0, -18], radius: 2, label: 'Spawn' },
    { kind: 'spawn', center: [18, 0, 0], radius: 2 },
    { kind: 'spawn', center: [-18, 0, 0], radius: 2 },
  ],
};

const town: MapDescriptor = {
  id: 'map.town',
  displayName: 'Town Square',
  halfSize: TOWN_HALF_SIZE,
  groundColor: '#4a6b3a',
  ambient: { color: '#fff2d0', intensity: 0.6 },
  // The town scenery (castle, houses, market, trees, rocks, terrain) is one baked
  // model — `public/models/lobby_world.glb`, authored in `tools/lobby_world.blend` —
  // rendered by `scene/LobbyWorld.tsx`. Its footprints are the collision circles in
  // TOWN_OBSTACLES (packages/shared). Gameplay objects (portals below, fountain,
  // podiums, altar) stay data/code-driven and are placed in the model's open spaces.
  props: [],
  zones: [
    { kind: 'portal', center: [0, 0, -14], radius: 2.5, label: 'Arena' },
    // Zombie survival gate — set apart from the arena gate so the two read as
    // distinct gateways. Travels straight into a co-op zombie arena.
    { kind: 'portal', center: [8, 0, -14], radius: 2.2, label: 'Zombie Mode', mode: 'zombie' },
  ],
};

export const MAPS: MapDescriptor[] = [arena, town];
