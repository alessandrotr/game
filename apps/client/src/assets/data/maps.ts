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
  groundColor: '#5b4f3c',
  ambient: { color: '#5a4a38', intensity: 0.4 },
  // A gritty, abandoned trailer park. The big pieces (trailers, burned cars,
  // dumpsters, scrap piles, drum clusters) are cover and line up 1:1 with the
  // collision circles in ARENA_LAYOUTS.trailerpark (packages/shared) — keep the
  // two in sync. Everything else (trash, debris, tyres, fences, broken crates,
  // loose/burning drums) is decorative scatter for a lived-in, chaotic feel.
  props: [
    // --- Cover (matches trailerpark collision circles) ---
    { assetId: 'prop.arena.trailer', position: [10, 0, 5], rotation: [0, -0.5, 0] },
    { assetId: 'prop.arena.trailer', position: [-10, 0, -5], rotation: [0, 2.64, 0] },
    { assetId: 'prop.arena.trailer.teal', position: [-11, 0, 8], rotation: [0, 0.6, 0] },
    { assetId: 'prop.arena.trailer.teal', position: [11, 0, -8], rotation: [0, -2.54, 0] },
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

    // --- Broken crates ---
    { assetId: 'prop.arena.crate.broken', position: [13, 0, 0] },
    { assetId: 'prop.arena.crate.broken', position: [-13, 0, 0], rotation: [0, 0.8, 0] },
    { assetId: 'prop.arena.crate.broken', position: [7, 0, 7], rotation: [0, 1.2, 0] },
    { assetId: 'prop.arena.crate.broken', position: [-7, 0, -7], rotation: [0, -0.6, 0] },
    { assetId: 'prop.arena.crate.broken', position: [3, 0, -6] },

    // --- Scattered ground debris ---
    { assetId: 'prop.arena.debris', position: [6, 0, -3] },
    { assetId: 'prop.arena.debris', position: [-6, 0, 3], rotation: [0, 1.1, 0] },
    { assetId: 'prop.arena.debris', position: [0, 0, 7], rotation: [0, 0.7, 0] },
    { assetId: 'prop.arena.debris', position: [0, 0, -7], rotation: [0, -0.9, 0] },
    { assetId: 'prop.arena.debris', position: [18, 0, 4], rotation: [0, 0.5, 0] },
    { assetId: 'prop.arena.debris', position: [-18, 0, -4], rotation: [0, -1.3, 0] },

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

    // --- Town-square centrepiece: the fountain is a custom shader component
    //     (see scene/Fountain.tsx), rendered by GameScene, not a data prop. ---

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
    { assetId: 'prop.bush', position: [-9.5, 0, -6] },
    { assetId: 'prop.bush', position: [7, 0, -13] },
    { assetId: 'prop.bush', position: [-11, 0, 18] },
    { assetId: 'prop.bush', position: [12, 0, 19] },
    { assetId: 'prop.flowers', position: [3.5, 0, 7] },
    { assetId: 'prop.flowers', position: [-3.5, 0, 8] },
    { assetId: 'prop.flowers', position: [5, 0, -3] },
    { assetId: 'prop.flowers', position: [-5, 0, -11] },

    // --- Extra greenery covering the whole grassy square inside the blade wall
    //     (corners included): trees, pines and plenty of stones, with a few
    //     bushes/flowers. Trees/pines/rocks carry matching footprints in
    //     TOWN_OBSTACLES; bushes and flowers are walkable. All clear of streets,
    //     the plaza, spawn, and building footprints. ---
    { assetId: 'prop.tree', position: [-36.5, 0, -35], scale: 1.29 },
    { assetId: 'prop.tree.pine', position: [-34.4, 0, -14.4], scale: 1.23 },
    { assetId: 'prop.flowers', position: [-37.2, 0, 24.9] },
    { assetId: 'prop.rock', position: [-35.8, 0, 32.7], scale: 1.18 },
    { assetId: 'prop.tree', position: [-27.5, 0, -29.3], scale: 1.2 },
    { assetId: 'prop.tree.pine', position: [-30.4, 0, -16.9] },
    { assetId: 'prop.bush', position: [-29.9, 0, -12.5] },
    { assetId: 'prop.tree', position: [-32.7, 0, -4.2] },
    { assetId: 'prop.rock', position: [-27.9, 0, 5.6], scale: 1.14 },
    { assetId: 'prop.flowers', position: [-29.8, 0, 13.9] },
    { assetId: 'prop.rock', position: [-34.1, 0, 15.9], scale: 1.18 },
    { assetId: 'prop.tree', position: [-33, 0, 29.3] },
    { assetId: 'prop.tree', position: [-22, 0, -34.8] },
    { assetId: 'prop.flowers', position: [-26.7, 0, -20.6] },
    { assetId: 'prop.rock', position: [-20.2, 0, -18.5], scale: 1.14 },
    { assetId: 'prop.tree', position: [-20.3, 0, -12.2] },
    { assetId: 'prop.tree', position: [-21.1, 0, -0.8], scale: 1.25 },
    { assetId: 'prop.rock', position: [-20.8, 0, 17.6], scale: 1.14 },
    { assetId: 'prop.rock', position: [-22.2, 0, 33.8], scale: 1.1 },
    { assetId: 'prop.flowers', position: [-17.3, 0, -33] },
    { assetId: 'prop.tree', position: [-15, 0, -7.8], scale: 1.13 },
    { assetId: 'prop.tree.pine', position: [-13.9, 0, 29] },
    { assetId: 'prop.tree.pine', position: [-6.3, 0, -16.4], scale: 1.16 },
    { assetId: 'prop.tree', position: [-12.1, 0, -13], scale: 1.06 },
    { assetId: 'prop.tree.pine', position: [-12.4, 0, 5.4] },
    { assetId: 'prop.bush', position: [-1.6, 0, -33.5] },
    { assetId: 'prop.rock', position: [-5.3, 0, -21.7], scale: 1.28 },
    { assetId: 'prop.rock', position: [-5.5, 0, 15.1], scale: 0.98 },
    { assetId: 'prop.flowers', position: [1.3, 0, 31.2] },
    { assetId: 'prop.tree', position: [7.5, 0, -19.8] },
    { assetId: 'prop.rock', position: [1.8, 0, 19.8], scale: 1.23 },
    { assetId: 'prop.rock', position: [13.6, 0, -35], scale: 1.17 },
    { assetId: 'prop.tree.pine', position: [13.2, 0, -24.4] },
    { assetId: 'prop.tree.pine', position: [12.9, 0, -1.4], scale: 1.03 },
    { assetId: 'prop.tree', position: [20.2, 0, -36.9] },
    { assetId: 'prop.tree', position: [17.2, 0, -12.1], scale: 1.2 },
    { assetId: 'prop.tree', position: [18.6, 0, 5.7] },
    { assetId: 'prop.tree.pine', position: [21, 0, 16.2] },
    { assetId: 'prop.rock', position: [19.7, 0, 30.6], scale: 1.07 },
    { assetId: 'prop.tree.pine', position: [29, 0, -29.3], scale: 1.06 },
    { assetId: 'prop.rock', position: [28.8, 0, -18.6], scale: 1.15 },
    { assetId: 'prop.tree', position: [26.9, 0, -2.7] },
    { assetId: 'prop.rock', position: [28.4, 0, 21.9], scale: 0.9 },
    { assetId: 'prop.rock', position: [28.3, 0, 35.2], scale: 0.81 },
    { assetId: 'prop.tree.pine', position: [32.4, 0, -31.6] },
    { assetId: 'prop.rock', position: [35.2, 0, -21.6], scale: 1.29 },
    { assetId: 'prop.rock', position: [32.7, 0, -16.9], scale: 1.11 },
    { assetId: 'prop.tree', position: [34.7, 0, -8.4] },
    { assetId: 'prop.tree', position: [35.6, 0, -1.9] },
    { assetId: 'prop.tree', position: [33.8, 0, 6.2] },
    { assetId: 'prop.rock', position: [30.6, 0, 9.2], scale: 0.95 },

    // --- Signpost at the spawn end of the street ---
    { assetId: 'prop.signpost', position: [3.5, 0, 14], rotation: [0, -0.5, 0] },
  ],
  zones: [
    { kind: 'spawn', center: [0, 0, 12], radius: 3, label: 'Spawn' },
    { kind: 'portal', center: [0, 0, -14], radius: 2.5, label: 'Arena' },
  ],
};

export const MAPS: MapDescriptor[] = [arena, town];
