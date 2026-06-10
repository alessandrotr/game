import type { PropDescriptor } from '@arena/shared';

/** Static world props (buildings, scenery) built from primitives. Origin at the base. */

const house: PropDescriptor = {
  id: 'prop.building.house',
  displayName: 'House',
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'walls',
        shape: 'box',
        args: [3, 2.2, 3],
        position: [0, 1.1, 0],
        color: '#9c7a5b',
        roughness: 0.9,
      },
      // 4-segment cone = pyramid roof.
      {
        name: 'roof',
        shape: 'cone',
        args: [2.4, 1.4, 4],
        position: [0, 2.9, 0],
        rotation: [0, Math.PI / 4, 0],
        color: '#7a3b3b',
        roughness: 0.9,
      },
      {
        name: 'door',
        shape: 'box',
        args: [0.7, 1.2, 0.1],
        position: [0, 0.6, 1.5],
        color: '#4a2f1a',
      },
    ],
  },
};

const tower: PropDescriptor = {
  id: 'prop.building.tower',
  displayName: 'Tower',
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'shaft',
        shape: 'cylinder',
        args: [1.2, 1.4, 5, 16],
        position: [0, 2.5, 0],
        color: '#8a8f9c',
        roughness: 0.9,
      },
      { name: 'roof', shape: 'cone', args: [1.5, 2, 16], position: [0, 6, 0], color: '#4f5d8a' },
    ],
  },
};

const tree: PropDescriptor = {
  id: 'prop.tree',
  displayName: 'Tree',
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'trunk',
        shape: 'cylinder',
        args: [0.2, 0.28, 1.6, 8],
        position: [0, 0.8, 0],
        color: '#5a3b22',
      },
      {
        name: 'foliage',
        shape: 'sphere',
        args: [1.1, 12, 12],
        position: [0, 2.2, 0],
        color: '#2f7d3f',
        roughness: 1,
      },
    ],
  },
};

export const PROPS: PropDescriptor[] = [house, tower, tree];
