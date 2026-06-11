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
  groundColor: '#1a1f33',
  ambient: { color: '#3a4a7a', intensity: 0.4 },
  props: [],
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
  props: [
    // --- Lord British's castle + city walls, looming behind the moongate ---
    { assetId: 'prop.castle', position: [0, 0, -27] },
    { assetId: 'prop.wall', position: [-9, 0, -29] },
    { assetId: 'prop.wall', position: [-14, 0, -29] },
    { assetId: 'prop.wall', position: [-19, 0, -29] },
    { assetId: 'prop.wall', position: [9, 0, -29] },
    { assetId: 'prop.wall', position: [14, 0, -29] },
    { assetId: 'prop.wall', position: [19, 0, -29] },
    { assetId: 'prop.wall', position: [-21.5, 0, -25.5], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.wall', position: [21.5, 0, -25.5], rotation: [0, HALF_PI, 0] },

    // --- Buildings lining the streets, facing inward ---
    { assetId: 'prop.building.inn', position: [-13, 0, 2], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.building.smithy', position: [13, 0, 6], rotation: [0, -HALF_PI, 0] },
    { assetId: 'prop.building.tower', position: [-20, 0, -16], rotation: [0, 0.5, 0] },
    { assetId: 'prop.building.tower', position: [20, 0, -16], rotation: [0, -0.5, 0] },
    { assetId: 'prop.building.house', position: [13, 0, -9], rotation: [0, -1.9, 0] },
    { assetId: 'prop.building.cottage', position: [-13, 0, -10], rotation: [0, 1.9, 0] },
    { assetId: 'prop.building.house', position: [-16, 0, 15], rotation: [0, 2.3, 0] },
    { assetId: 'prop.building.cottage', position: [16, 0, 16], rotation: [0, -2.3, 0] },
    { assetId: 'prop.building.house', position: [19, 0, -2], rotation: [0, -HALF_PI, 0] },
    { assetId: 'prop.building.cottage', position: [-19, 0, -3], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.building.house', position: [-10, 0, 23], rotation: [0, Math.PI, 0] },
    { assetId: 'prop.building.cottage', position: [10, 0, 24], rotation: [0, Math.PI, 0] },

    // --- Town-square centrepiece + the moongate (arena portal) ---
    { assetId: 'prop.well', position: [0, 0, -2] },

    // --- Market: stalls, cart, goods near the merchant ---
    { assetId: 'prop.market.stall', position: [5, 0, 5], rotation: [0, -0.5, 0] },
    { assetId: 'prop.market.stall', position: [-5, 0, 6], rotation: [0, 0.5, 0] },
    { assetId: 'prop.cart', position: [7, 0, 2], rotation: [0, 0.4, 0] },
    { assetId: 'prop.crate', position: [6, 0, 6.5] },
    { assetId: 'prop.crate', position: [-6, 0, 7.5], rotation: [0, 0.7, 0] },
    { assetId: 'prop.barrel', position: [-8.5, 0, 4] },
    { assetId: 'prop.barrel', position: [10, 0, 7.5] },

    // --- Lamps flanking the main street (spawn → well → moongate → castle) ---
    { assetId: 'prop.lamp', position: [3, 0, 12] },
    { assetId: 'prop.lamp', position: [-3, 0, 12] },
    { assetId: 'prop.lamp', position: [3.2, 0, 4] },
    { assetId: 'prop.lamp', position: [-3.2, 0, 4] },
    { assetId: 'prop.lamp', position: [3.2, 0, -8] },
    { assetId: 'prop.lamp', position: [-3.2, 0, -8] },

    // --- A fenced yard beside the back cottage ---
    { assetId: 'prop.fence', position: [-14, 0, -7] },
    { assetId: 'prop.fence', position: [-12, 0, -7] },
    { assetId: 'prop.fence', position: [-10.6, 0, -8.4], rotation: [0, HALF_PI, 0] },

    // --- Trees, pines, and rocks framing the edges ---
    { assetId: 'prop.tree', position: [-24, 0, 10], scale: 1.2 },
    { assetId: 'prop.tree', position: [24, 0, 12] },
    { assetId: 'prop.tree', position: [0, 0, 27], scale: 1.3 },
    { assetId: 'prop.tree', position: [-9, 0, 30] },
    { assetId: 'prop.tree.pine', position: [-25, 0, -8] },
    { assetId: 'prop.tree.pine', position: [25, 0, -10], scale: 1.1 },
    { assetId: 'prop.tree.pine', position: [-22, 0, 22] },
    { assetId: 'prop.tree.pine', position: [22, 0, 24] },
    { assetId: 'prop.tree.pine', position: [11, 0, 30], scale: 1.1 },
    { assetId: 'prop.rock', position: [-26, 0, 2] },
    { assetId: 'prop.rock', position: [26, 0, 4], scale: 1.3 },
    { assetId: 'prop.rock', position: [16, 0, -18] },
    { assetId: 'prop.rock', position: [-16, 0, -19], scale: 1.2 },

    // --- Bushes & flowerbeds softening the ground ---
    { assetId: 'prop.bush', position: [-9, 0, 11] },
    { assetId: 'prop.bush', position: [9, 0, 11] },
    { assetId: 'prop.bush', position: [-7, 0, -4] },
    { assetId: 'prop.bush', position: [7, 0, -13] },
    { assetId: 'prop.bush', position: [-11, 0, 18] },
    { assetId: 'prop.bush', position: [12, 0, 19] },
    { assetId: 'prop.flowers', position: [3.5, 0, 7] },
    { assetId: 'prop.flowers', position: [-3.5, 0, 8] },
    { assetId: 'prop.flowers', position: [5, 0, -3] },
    { assetId: 'prop.flowers', position: [-5, 0, -11] },

    // --- Signpost at the spawn end of the street ---
    { assetId: 'prop.signpost', position: [3.5, 0, 14], rotation: [0, -0.5, 0] },
  ],
  zones: [
    { kind: 'spawn', center: [0, 0, 12], radius: 3, label: 'Spawn' },
    { kind: 'portal', center: [0, 0, -14], radius: 2.5, label: 'Arena' },
  ],
};

export const MAPS: MapDescriptor[] = [arena, town];
