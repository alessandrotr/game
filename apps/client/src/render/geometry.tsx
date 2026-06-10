import type { PrimitiveShape } from '@arena/shared';

type Args = number[];

/** Maps a primitive shape descriptor to its R3F geometry element. */
export function PrimitiveGeometry({ shape, args }: { shape: PrimitiveShape; args: Args }) {
  switch (shape) {
    case 'box':
      return <boxGeometry args={args as [number, number, number]} />;
    case 'sphere':
      return <sphereGeometry args={args as [number, number, number]} />;
    case 'capsule':
      return <capsuleGeometry args={args as [number, number, number, number]} />;
    case 'cone':
      return <coneGeometry args={args as [number, number, number]} />;
    case 'cylinder':
      return <cylinderGeometry args={args as [number, number, number, number]} />;
    case 'torus':
      return <torusGeometry args={args as [number, number, number, number, number]} />;
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}
