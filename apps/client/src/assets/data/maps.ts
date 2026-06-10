import type { MapDescriptor } from '@arena/shared';
import { ARENA_HALF_SIZE } from '@arena/shared';

/** Maps are pure data: a ground spec plus a list of instances placed by asset id. */

const arena: MapDescriptor = {
  id: 'map.arena',
  displayName: 'The Arena',
  halfSize: ARENA_HALF_SIZE,
  groundColor: '#1a1f33',
  ambient: { color: '#3a4a7a', intensity: 0.4 },
  props: [
    { assetId: 'vfx.portal', position: [0, 0, -ARENA_HALF_SIZE + 2] },
    {
      assetId: 'char.npc.guard',
      position: [-2.5, 0, -ARENA_HALF_SIZE + 2.5],
      rotation: [0, 0.4, 0],
    },
    {
      assetId: 'char.npc.guard',
      position: [2.5, 0, -ARENA_HALF_SIZE + 2.5],
      rotation: [0, -0.4, 0],
    },
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
    { assetId: 'char.npc.merchant', position: [0, 0, 2], rotation: [0, Math.PI, 0] },
    { assetId: 'vfx.portal', position: [0, 0, -14] },
  ],
};

export const MAPS: MapDescriptor[] = [arena, town];
