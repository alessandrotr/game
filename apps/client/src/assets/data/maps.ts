import type { MapDescriptor } from '@arena/shared';
import { ARENA_HALF_SIZE } from '@arena/shared';

/**
 * Maps are pure data: a ground spec, a list of instances placed by asset id, and
 * semantic zones laid out by the builders (Phase 8). Interactable NPCs live in
 * the NPC system (`assets/data/npcs.ts`), not in `props`, so their look,
 * placement, and dialogue stay together.
 */

const PORTAL_Z = -ARENA_HALF_SIZE + 2;

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
  groundColor: '#2a3a1e',
  ambient: { color: '#fff2d0', intensity: 0.6 },
  props: [
    { assetId: 'prop.building.house', position: [-8, 0, -6], rotation: [0, 0.3, 0] },
    { assetId: 'prop.building.house', position: [9, 0, -5], rotation: [0, -0.5, 0] },
    { assetId: 'prop.building.tower', position: [-12, 0, 8] },
    { assetId: 'prop.tree', position: [5, 0, 7] },
    { assetId: 'prop.tree', position: [-4, 0, 10] },
    { assetId: 'vfx.portal', position: [0, 0, -14] },
  ],
  zones: [
    { kind: 'spawn', center: [0, 0, 12], radius: 3, label: 'Spawn' },
    { kind: 'npc', center: [0, 0, 2], radius: 3.5, label: 'Merchant' },
    { kind: 'shop', center: [12, 0, 4], radius: 4, label: 'Shop (soon)' },
    { kind: 'portal', center: [0, 0, -14], radius: 2.5, label: 'Arena' },
  ],
};

export const MAPS: MapDescriptor[] = [arena, town];
