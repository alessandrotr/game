import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, MathUtils, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CASTLE } from '@arena/shared';
import { getLocalRenderTransform } from '../store/localPlayer';
import { useQualityStore } from '../store/useQualityStore';

/**
 * The town hub's scenery: ONE baked model (castle, houses, market, fountain, trees,
 * terrain + distant mountains) authored by the generator in `tools/lobby/` and exported
 * to `public/models/lobby_world.glb` in game coordinates (Y-up, 1 unit = 1 metre,
 * plaza + fountain centred on (0, -2), castle gate facing +z).
 *
 * Collision lives in `TOWN_OBSTACLES` (packages/shared) — generated from the same
 * footprints. Nothing here is interactive; it is purely visual.
 *
 * Draw-call budget: the glTF arrives as ~440 meshes (every building has ~13 material
 * slots). Everything is static, so at load we bake world matrices and MERGE geometry by
 * (material, shadow-casting, castle-front, 48 m cell) — a few dozen draw calls, still
 * frustum-culled per cell.
 *
 * Castle front-wall fade: nodes whose name starts with `Castle_Front` (front wall,
 * gatehouse, front towers, banners) ghost out while you stand inside the courtyard so
 * the curtain wall between you and the camera doesn't hide the bailey.
 */
export const LOBBY_WORLD_URL = '/models/lobby_world.glb';

/** How visible the castle's front region stays while you're inside (0 = invisible). */
const GHOST_OPACITY = 0.16;
/** Above this opacity the region renders fully solid (opaque pass). */
const SOLID_THRESHOLD = 0.985;
/** Spatial merge cell, metres. Big enough to cut draw calls, small enough to cull. */
const CELL = 48;

/** Nodes that only ever receive shadows (huge, flat, or alpha-thin) — casting from them is pure cost. */
const NO_CAST = /^(Terrain|Ground|Plaza|Roads|Kerbs|Lake|Grass_|Flowers_)/;
/** Dense ground clutter we drop entirely on the Low tier. */
const CLUTTER = /^(Grass_|Flowers_)/;

interface FadeMat {
  mat: Material;
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthWrite: boolean;
}

interface Bucket {
  geos: BufferGeometry[];
  material: Material;
  front: boolean;
  cast: boolean;
}

function isCastleFront(o: Object3D): boolean {
  let n: Object3D | null = o;
  while (n) {
    if (n.name.startsWith('Castle_Front')) return true;
    n = n.parent;
  }
  return false;
}

function buildMerged(scene: Object3D, lowTier: boolean) {
  const root = new Group();
  const fadeMats: FadeMat[] = [];
  const frontClones = new Map<Material, Material>();
  const buckets = new Map<string, Bucket>();
  const temp: BufferGeometry[] = [];

  scene.updateMatrixWorld(true);
  scene.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (lowTier && CLUTTER.test(mesh.name)) return;
    const front = isCastleFront(mesh);
    const cast = !NO_CAST.test(mesh.name);

    let material = mesh.material;
    if (material.name === 'water') {
      material.transparent = true;
      material.depthWrite = false;
    }
    if (front) {
      let c = frontClones.get(material);
      if (!c) {
        c = material.clone();
        frontClones.set(material, c);
        fadeMats.push({
          mat: c,
          baseOpacity: c.opacity,
          baseTransparent: c.transparent,
          baseDepthWrite: c.depthWrite,
        });
      }
      material = c;
    }

    const g = mesh.geometry.clone();
    // The Blender exporter writes TWO colour sets: COLOR_0 is an all-white placeholder and the real
    // baked colours (tint x AO, painted foliage, terrain) are in COLOR_1. Promote COLOR_1 to `color`
    // (the only set three.js reads) and drop the placeholder.
    const real = g.getAttribute('color_1');
    if (real) {
      g.setAttribute('color', real);
      g.deleteAttribute('color_1');
    }
    g.applyMatrix4(mesh.matrixWorld);
    g.computeBoundingSphere();
    const ctr = g.boundingSphere?.center;
    const cx = ctr ? Math.floor(ctr.x / CELL) : 0;
    const cz = ctr ? Math.floor(ctr.z / CELL) : 0;
    const key = `${material.uuid}|${front ? 1 : 0}|${cast ? 1 : 0}|${cx},${cz}`;
    let b = buckets.get(key);
    if (!b) {
      b = { geos: [], material, front, cast };
      buckets.set(key, b);
    }
    b.geos.push(g);
    temp.push(g);
  });

  const merged: BufferGeometry[] = [];
  for (const b of buckets.values()) {
    let geo: BufferGeometry | null = b.geos.length === 1 ? (b.geos[0] ?? null) : null;
    if (!geo) {
      try {
        geo = mergeGeometries(b.geos, false);
      } catch {
        geo = null;
      }
    }
    if (geo) {
      merged.push(geo);
      const m = new Mesh(geo, b.material);
      m.castShadow = b.cast;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false; // static
      root.add(m);
    } else {
      // attribute layouts differ — keep the pieces as-is rather than lose them
      for (const g of b.geos) {
        const m = new Mesh(g, b.material);
        m.castShadow = b.cast;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        root.add(m);
        merged.push(g);
      }
    }
  }
  // the per-mesh temporaries were copied into the merged buffers (or reused directly)
  for (const g of temp) if (!merged.includes(g)) g.dispose();
  return { root, fadeMats, geometries: merged };
}

export function LobbyWorld() {
  const { scene } = useGLTF(LOBBY_WORLD_URL);
  const fade = useRef(1);
  const tier = useQualityStore((s) => s.tier);

  // The GLB cache is shared (the login backdrop mounts the same scene), so we never
  // touch the cached scene itself: the merged copy is built per mount.
  const built = useMemo(() => buildMerged(scene, tier === 'low'), [scene, tier]);

  useEffect(
    () => () => {
      built.geometries.forEach((g) => g.dispose());
      built.fadeMats.forEach((f) => f.mat.dispose());
    },
    [built],
  );

  useFrame((_, dt) => {
    const { fadeMats } = built;
    if (fadeMats.length === 0) return;
    const t = getLocalRenderTransform();
    const inside =
      t.active &&
      Math.abs(t.x - CASTLE.x) <= CASTLE.halfX &&
      Math.abs(t.z - CASTLE.z) <= CASTLE.halfZ;
    fade.current = MathUtils.damp(fade.current, inside ? GHOST_OPACITY : 1, 9, dt);
    const opacity = fade.current;
    const ghost = opacity < SOLID_THRESHOLD;
    for (const f of fadeMats) {
      const transparent = ghost || f.baseTransparent;
      if (f.mat.transparent !== transparent) {
        f.mat.transparent = transparent;
        f.mat.needsUpdate = true;
      }
      // A ghost must not write depth (it would occlude the bailey behind it).
      f.mat.depthWrite = ghost ? false : f.baseDepthWrite;
      f.mat.opacity = ghost ? opacity * f.baseOpacity : f.baseOpacity;
    }
  });

  return <primitive object={built.root} />;
}
