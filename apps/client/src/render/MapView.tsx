import type { MapAssetId } from '@arena/shared';
import { assets } from '../assets/registry';
import { AssetInstance } from './AssetInstance';

/**
 * Renders a map's placed instances from its descriptor. Ground/walls are owned
 * by the scene; this places everything the map references by asset id.
 */
export function MapView({ mapId }: { mapId: MapAssetId }) {
  const map = assets.getMap(mapId);
  if (!map) return null;

  return (
    <group>
      {map.props.map((prop, i) => (
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
