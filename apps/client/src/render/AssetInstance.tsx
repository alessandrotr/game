import type { AssetId } from '@arena/shared';
import { assetCategory } from '@arena/shared';
import { assets } from '../assets/registry';
import { AssetMesh } from './AssetMesh';
import { CharacterModel } from './CharacterModel';
import { Vfx } from './Vfx';

/**
 * Renders any asset purely from its id by dispatching on the id's category.
 * This is what lets maps (and game logic) place things by reference rather than
 * knowing concrete components or file paths.
 */
export function AssetInstance({ id }: { id: AssetId }) {
  switch (assetCategory(id)) {
    case 'char': {
      return <CharacterModel descriptor={assets.getCharacter(id as `char.${string}`)} />;
    }
    case 'prop': {
      const prop = assets.getProp(id as `prop.${string}`);
      // Props are static (until destroyed) — batch their parts into a few merged
      // meshes so dense fields of barrels/drums/houses aren't hundreds of draws.
      return prop ? <AssetMesh source={prop.render} merge /> : null;
    }
    case 'weapon': {
      const weapon = assets.getWeapon(id as `weapon.${string}`);
      return weapon ? <AssetMesh source={weapon.render} /> : null;
    }
    case 'vfx': {
      const vfx = assets.getVfx(id as `vfx.${string}`);
      return vfx ? <Vfx descriptor={vfx} /> : null;
    }
    default:
      return null;
  }
}
