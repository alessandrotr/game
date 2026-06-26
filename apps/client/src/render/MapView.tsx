import { useEffect, useMemo } from 'react';
import type { Matrix4 } from 'three';
import {
  assetCategory,
  type AssetId,
  type MapAssetId,
  type MapProp,
  type PlaceholderPart,
} from '@arena/shared';
import { assets } from '../assets/registry';
import { AssetInstance } from './AssetInstance';
import { mergePlaced, trsMatrix, type MergedGroup } from './mergeGeometry';
import { MergedGroupMesh } from './MergedGroupMesh';
import { useDebugStore } from '../store/useDebugStore';

/**
 * Renders a map's placed instances. Ground/walls are owned by the scene; this
 * places everything referenced by asset id. `props` overrides the descriptor's
 * static list — the arena passes its per-match procedurally generated props.
 *
 * Static placeholder props (the bulk — buildings, trees, rocks) are MERGED into
 * a few batched meshes per material so the town isn't hundreds of draw calls.
 * Anything else (GLTF/characters/vfx) falls back to a per-instance render.
 */
export function MapView({
  mapId,
  props,
  exclude,
}: {
  mapId: MapAssetId;
  props?: MapProp[];
  /** Asset ids to skip — e.g. the castle, rendered separately so it can react to
   *  the player (interior occlusion). */
  exclude?: readonly string[];
}) {
  const map = assets.getMap(mapId);
  // Stable key for the exclude list so the merge memo doesn't rebuild every
  // render (callers pass a fresh array literal).
  const excludeKey = exclude ? [...exclude].sort().join(',') : '';

  const { merged, others } = useMemo(() => {
    const all = props ?? assets.getMap(mapId)?.props ?? [];
    const skip = excludeKey ? new Set(excludeKey.split(',')) : null;
    const items = skip ? all.filter((p) => !skip.has(p.assetId)) : all;
    return buildMerged(items);
  }, [mapId, props, excludeKey]);

  // Merged geometries are created here; free them when they're replaced/unmount.
  useEffect(() => () => merged.forEach((g) => g.geometry.dispose()), [merged]);

  // Dev "Perf Debug": skip the scenery props to measure their cost.
  const hideMapProps = useDebugStore((s) => s.hideMapProps);

  if (!map || hideMapProps) return null;

  return (
    <group>
      {merged.map((g) => (
        <MergedGroupMesh key={g.key} group={g} />
      ))}
      {others.map((prop, i) => (
        <group
          key={`${prop.assetId}:${i}`}
          position={prop.position}
          rotation={prop.rotation ?? [0, 0, 0]}
          scale={prop.scale ?? 1}
        >
          <AssetInstance id={prop.assetId} />
        </group>
      ))}
    </group>
  );
}

/** Split a map's items into one merged set (static placeholder props) and a
 *  fallback list (everything else, rendered per-instance). */
function buildMerged(items: readonly MapProp[]): { merged: MergedGroup[]; others: MapProp[] } {
  const placed: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  const others: MapProp[] = [];
  for (const item of items) {
    const prop =
      assetCategory(item.assetId as AssetId) === 'prop'
        ? assets.getProp(item.assetId as `prop.${string}`)
        : null;
    if (prop && prop.render.kind === 'placeholder') {
      const propMatrix = trsMatrix(item.position, item.rotation, item.scale);
      for (const part of prop.render.parts) {
        const matrix = propMatrix
          .clone()
          .multiply(trsMatrix(part.position, part.rotation, part.scale));
        placed.push({ part, matrix });
      }
    } else {
      others.push(item);
    }
  }
  return { merged: mergePlaced(placed), others };
}
