import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlaceholderModel, PlaceholderPart, Vec3 } from '@arena/shared';

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

/**
 * Per-model merged geometry for a placeholder prop, cached so every instance of
 * the same model (e.g. every oil drum) shares one set of batched meshes. A prop's
 * parts never move relative to each other, so baking them into a few
 * material-grouped meshes turns a ~30-part house from ~30 draw calls into a
 * handful, with no visible change. Animated `fire` parts can't be baked (they each
 * need their own live shader), so they're kept out and drawn individually.
 */
export interface MergedProp {
  groups: MergedGroup[];
  fireParts: PlaceholderPart[];
}
const mergedPropCache = new WeakMap<PlaceholderModel, MergedProp>();

export function getMergedProp(model: PlaceholderModel): MergedProp {
  const cached = mergedPropCache.get(model);
  if (cached) return cached;
  const fireParts: PlaceholderPart[] = [];
  const placed: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  for (const part of model.parts) {
    if (part.material === 'fire') {
      fireParts.push(part);
      continue;
    }
    placed.push({ part, matrix: trsMatrix(part.position, part.rotation, part.scale) });
  }
  const result: MergedProp = { groups: mergePlaced(placed), fireParts };
  mergedPropCache.set(model, result);
  return result;
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
  /** When true the group bakes each part's color into a vertex-color attribute, so
   *  plain opaque parts of ANY color share ONE mesh (color no longer splits draws). */
  vertexColors: boolean;
}

/** A "plain" part is an opaque, non-special, non-glowing standard surface — the
 *  bulk of most props (walls, logs, planks, stone). Such parts only differ by
 *  COLOR, so they can be baked into a single vertex-colored mesh. Parts with a
 *  special material (glass/brick/tile/fire), an emissive glow, or transparency are
 *  NOT plain — they keep their own per-material mesh so nothing regresses. */
function isPlain(p: PlaceholderPart): boolean {
  return (
    !p.material &&
    (!p.emissive || p.emissive === '#000000') &&
    (p.opacity == null || p.opacity === 1)
  );
}

/** Material identity: parts that match here can share one merged mesh. Plain parts
 *  group by their lit params only (color goes to vertex colors); everything else
 *  keeps the full per-material identity so glass/brick/tile/glow stay correct. */
function materialKey(p: PlaceholderPart): string {
  if (isPlain(p)) {
    return ['vc', p.metalness ?? '-', p.roughness ?? '-'].join('#');
  }
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
    {
      geos: BufferGeometry[];
      rep: PlaceholderPart;
      cast: boolean;
      recv: boolean;
      region: string;
      vertexColors: boolean;
    }
  >();
  for (const { part, matrix } of placed) {
    const geo = geometryForPart(part);
    geo.applyMatrix4(matrix);
    const cast = part.castShadow ?? true;
    const recv = part.receiveShadow ?? true;
    const region = regionOf ? regionOf(part) : 'all';
    const vertexColors = isPlain(part);
    if (vertexColors) {
      // Bake this part's flat color into a per-vertex color attribute so parts of
      // different colors can still merge into one mesh. `new Color(hex)` yields the
      // linear-space rgb three expects for vertex colors.
      const c = new Color(part.color || '#ffffff');
      const count = geo.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    }
    const key = `${region}|${materialKey(part)}|${cast ? 1 : 0}|${recv ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      g = { geos: [], rep: part, cast, recv, region, vertexColors };
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
        vertexColors: g.vertexColors,
      });
    }
  }
  return out;
}
