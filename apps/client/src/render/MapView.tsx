import type { MapAssetId, MapProp } from '@arena/shared';
import { assets } from '../assets/registry';
import { AssetInstance } from './AssetInstance';

/**
 * Renders a map's placed instances. Ground/walls are owned by the scene; this
 * places everything referenced by asset id. `props` overrides the descriptor's
 * static list — the arena passes its per-match procedurally generated props.
 */
export function MapView({ mapId, props }: { mapId: MapAssetId; props?: MapProp[] }) {
  const map = assets.getMap(mapId);
  if (!map) return null;
  const items = props ?? map.props;

  return (
    <group>
      {items.map((prop, i) => (
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
