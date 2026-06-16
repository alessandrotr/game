import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlaceholderPart, Vec3 } from '@arena/shared';

/**
 * Static-geometry merging for placeholder props.
 *
 * The town's buildings are made of hundreds of tiny boxes/cones — one draw call
 * each, which is what makes the scene lag. Since they never move, we bake each
 * part's transform into its geometry and merge everything that shares a material
 * into ONE geometry, turning hundreds of draw calls into a handful. The brick /
 * roof-tile shaders key off world position, so a merged mesh (rendered at the
 * identity transform with world-space vertices) looks identical to the originals.
 */

function geometryForPart(part: PlaceholderPart): BufferGeometry {
  const a = part.args;
  switch (part.shape) {
    case 'sphere':
      return new SphereGeometry(a[0], a[1], a[2]);
    case 'capsule':
      return new CapsuleGeometry(a[0], a[1], a[2], a[3]);
    case 'cone':
      return new ConeGeometry(a[0], a[1], a[2]);
    case 'cylinder':
      return new CylinderGeometry(a[0], a[1], a[2], a[3]);
    case 'torus':
      return new TorusGeometry(a[0], a[1], a[2], a[3], a[4]);
    case 'box':
    default:
      return new BoxGeometry(a[0] ?? 1, a[1] ?? 1, a[2] ?? 1);
  }
}

/** Compose a TRS matrix from a placeholder part's (or prop's) transform. */
export function trsMatrix(position?: Vec3, rotation?: Vec3, scale?: Vec3 | number): Matrix4 {
  const s = typeof scale === 'number' ? [scale, scale, scale] : (scale ?? [1, 1, 1]);
  return new Matrix4().compose(
    new Vector3(position?.[0] ?? 0, position?.[1] ?? 0, position?.[2] ?? 0),
    new Quaternion().setFromEuler(
      new Euler(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0),
    ),
    new Vector3(s[0], s[1], s[2]),
  );
}

/** One material's worth of merged geometry. */
export interface MergedGroup {
  key: string;
  region: string;
  geometry: BufferGeometry;
  part: PlaceholderPart; // representative — supplies the material props
  castShadow: boolean;
  receiveShadow: boolean;
}

/** Material identity: parts that match here can share one merged mesh. */
function materialKey(p: PlaceholderPart): string {
  return [
    p.material ?? 'std',
    p.color,
    p.emissive ?? '-',
    p.emissiveIntensity ?? '-',
    p.metalness ?? '-',
    p.roughness ?? '-',
    p.opacity ?? '-',
  ].join('#');
}

/**
 * Merge transformed parts into one geometry per (region, material, shadow flags).
 * `regionOf` optionally tags a part so callers can keep groups separable for
 * toggling (e.g. the castle's cutaway hides its front region).
 */
export function mergePlaced(
  placed: { part: PlaceholderPart; matrix: Matrix4 }[],
  regionOf?: (part: PlaceholderPart) => string,
): MergedGroup[] {
  const groups = new Map<
    string,
    { geos: BufferGeometry[]; rep: PlaceholderPart; cast: boolean; recv: boolean; region: string }
  >();
  for (const { part, matrix } of placed) {
    const geo = geometryForPart(part);
    geo.applyMatrix4(matrix);
    const cast = part.castShadow ?? true;
    const recv = part.receiveShadow ?? true;
    const region = regionOf ? regionOf(part) : 'all';
    const key = `${region}|${materialKey(part)}|${cast ? 1 : 0}|${recv ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      g = { geos: [], rep: part, cast, recv, region };
      groups.set(key, g);
    }
    g.geos.push(geo);
  }
  const out: MergedGroup[] = [];
  for (const [key, g] of groups) {
    const merged = mergeGeometries(g.geos, false);
    for (const geo of g.geos) geo.dispose();
    if (merged) {
      out.push({
        key,
        region: g.region,
        geometry: merged,
        part: g.rep,
        castShadow: g.cast,
        receiveShadow: g.recv,
      });
    }
  }
  return out;
}
