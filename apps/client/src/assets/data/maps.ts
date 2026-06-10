import type { MapDescriptor } from '@arena/shared';
import { ARENA_HALF_SIZE } from '@arena/shared';

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
  props: [{ assetId: 'vfx.portal', position: [0, 0, PORTAL_Z] }],
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
  halfSize: 35,
  groundColor: '#4a6b3a',
  ambient: { color: '#fff2d0', intensity: 0.6 },
  props: [
    // --- Buildings, ringing the square and facing inward ---
    { assetId: 'prop.building.inn', position: [-12, 0, 1], rotation: [0, HALF_PI, 0] },
    { assetId: 'prop.building.smithy', position: [12.5, 0, 5], rotation: [0, -HALF_PI, 0] },
    { assetId: 'prop.building.tower', position: [-15.5, 0, -14], rotation: [0, 0.6, 0] },
    { assetId: 'prop.building.house', position: [11, 0, -8], rotation: [0, -1.9, 0] },
    { assetId: 'prop.building.cottage', position: [-11, 0, -9], rotation: [0, 1.9, 0] },
    { assetId: 'prop.building.house', position: [-12, 0, 12], rotation: [0, 2.3, 0] },
    { assetId: 'prop.building.cottage', position: [11.5, 0, 13], rotation: [0, -2.3, 0] },
    { assetId: 'prop.building.house', position: [15, 0, -2], rotation: [0, -HALF_PI, 0] },

    // --- Town-square centrepiece + portal gateway ---
    { assetId: 'prop.well', position: [0, 0, -2] },
    { assetId: 'prop.arch', position: [0, 0, -13.5] },
    { assetId: 'vfx.portal', position: [0, 0, -14] },

    // --- Market: stalls, cart, goods near the merchant ---
    { assetId: 'prop.market.stall', position: [5, 0, 4], rotation: [0, -0.5, 0] },
    { assetId: 'prop.market.stall', position: [-5, 0, 5], rotation: [0, 0.5, 0] },
    { assetId: 'prop.cart', position: [7, 0, 1.5], rotation: [0, 0.4, 0] },
    { assetId: 'prop.crate', position: [6, 0, 5.5] },
    { assetId: 'prop.crate', position: [-6, 0, 6.5], rotation: [0, 0.7, 0] },
    { assetId: 'prop.barrel', position: [-8.5, 0, 3] },
    { assetId: 'prop.barrel', position: [10, 0, 6.5] },

    // --- Lamps flanking the central path (spawn → well → portal) ---
    { assetId: 'prop.lamp', position: [2.8, 0, 9] },
    { assetId: 'prop.lamp', position: [-2.8, 0, 9] },
    { assetId: 'prop.lamp', position: [3, 0, -6] },
    { assetId: 'prop.lamp', position: [-3, 0, -6] },
    { assetId: 'prop.lamp', position: [2.8, 0, -11.5] },
    { assetId: 'prop.lamp', position: [-2.8, 0, -11.5] },

    // --- A fenced yard beside the back cottage ---
    { assetId: 'prop.fence', position: [-12, 0, -6] },
    { assetId: 'prop.fence', position: [-10, 0, -6] },
    { assetId: 'prop.fence', position: [-8.6, 0, -7.4], rotation: [0, HALF_PI, 0] },

    // --- Trees, pines, and rocks framing the edges ---
    { assetId: 'prop.tree', position: [-18, 0, 9], scale: 1.1 },
    { assetId: 'prop.tree', position: [18, 0, 11] },
    { assetId: 'prop.tree', position: [0, 0, 19], scale: 1.2 },
    { assetId: 'prop.tree.pine', position: [-19, 0, -7] },
    { assetId: 'prop.tree.pine', position: [19, 0, -9], scale: 1.1 },
    { assetId: 'prop.tree.pine', position: [-16, 0, 17] },
    { assetId: 'prop.tree.pine', position: [16, 0, 18] },
    { assetId: 'prop.rock', position: [-20, 0, 1] },
    { assetId: 'prop.rock', position: [20, 0, 3], scale: 1.3 },
    { assetId: 'prop.rock', position: [14, 0, -15] },

    // --- Bushes & flowerbeds softening the ground ---
    { assetId: 'prop.bush', position: [-9, 0, 9] },
    { assetId: 'prop.bush', position: [9, 0, 9] },
    { assetId: 'prop.bush', position: [-7, 0, -4] },
    { assetId: 'prop.bush', position: [7, 0, -12] },
    { assetId: 'prop.flowers', position: [3.5, 0, 6] },
    { assetId: 'prop.flowers', position: [-3.5, 0, 7] },
    { assetId: 'prop.flowers', position: [4.5, 0, -3] },
    { assetId: 'prop.flowers', position: [-4.5, 0, -10] },

    // --- Signpost at the spawn end of the path ---
    { assetId: 'prop.signpost', position: [3, 0, 10.5], rotation: [0, -0.5, 0] },
  ],
  zones: [
    { kind: 'spawn', center: [0, 0, 12], radius: 3, label: 'Spawn' },
    { kind: 'npc', center: [0, 0, 2], radius: 3.5, label: 'Merchant' },
    { kind: 'shop', center: [12, 0, 4], radius: 4, label: 'Blacksmith' },
    { kind: 'portal', center: [0, 0, -14], radius: 2.5, label: 'Arena' },
  ],
};

export const MAPS: MapDescriptor[] = [arena, town];
