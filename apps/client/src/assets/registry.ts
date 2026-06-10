import type {
  AnimationAssetId,
  AnimationDescriptor,
  AssetId,
  CharacterAssetId,
  CharacterDescriptor,
  MapAssetId,
  MapDescriptor,
  PropAssetId,
  PropDescriptor,
  VfxAssetId,
  VfxDescriptor,
  WeaponAssetId,
  WeaponDescriptor,
} from '@arena/shared';
import { assetCategory } from '@arena/shared';

/**
 * Central asset registry. Everything in the game references assets by **id**;
 * the registry is the only place that knows how an id maps to a descriptor (and
 * thus to a placeholder mesh today, or a GLTF tomorrow). Swapping art = editing
 * a registry entry, never touching gameplay code.
 *
 * Missing-asset policy: characters fall back to a loud magenta placeholder so a
 * bad reference is obvious on screen rather than crashing; other categories warn
 * and return `undefined`.
 */
class AssetRegistry {
  private readonly characters = new Map<CharacterAssetId, CharacterDescriptor>();
  private readonly weapons = new Map<WeaponAssetId, WeaponDescriptor>();
  private readonly vfx = new Map<VfxAssetId, VfxDescriptor>();
  private readonly props = new Map<PropAssetId, PropDescriptor>();
  private readonly maps = new Map<MapAssetId, MapDescriptor>();
  private readonly animations = new Map<AnimationAssetId, AnimationDescriptor>();

  registerCharacter(descriptor: CharacterDescriptor): void {
    this.characters.set(descriptor.id, descriptor);
  }
  registerWeapon(descriptor: WeaponDescriptor): void {
    this.weapons.set(descriptor.id, descriptor);
  }
  registerVfx(descriptor: VfxDescriptor): void {
    this.vfx.set(descriptor.id, descriptor);
  }
  registerProp(descriptor: PropDescriptor): void {
    this.props.set(descriptor.id, descriptor);
  }
  registerMap(descriptor: MapDescriptor): void {
    this.maps.set(descriptor.id, descriptor);
  }
  registerAnimation(descriptor: AnimationDescriptor): void {
    this.animations.set(descriptor.id, descriptor);
  }

  /** Resolve a character, returning a visible fallback if the id is unknown. */
  getCharacter(id: CharacterAssetId): CharacterDescriptor {
    const found = this.characters.get(id);
    if (found) return found;
    console.warn(`[assets] Unknown character "${id}" — using fallback.`);
    return MISSING_CHARACTER(id);
  }

  getWeapon(id: WeaponAssetId): WeaponDescriptor | undefined {
    return this.warnIfMissing(this.weapons.get(id), id);
  }
  getVfx(id: VfxAssetId): VfxDescriptor | undefined {
    return this.warnIfMissing(this.vfx.get(id), id);
  }
  getProp(id: PropAssetId): PropDescriptor | undefined {
    return this.warnIfMissing(this.props.get(id), id);
  }
  getMap(id: MapAssetId): MapDescriptor | undefined {
    return this.warnIfMissing(this.maps.get(id), id);
  }
  getAnimation(id: AnimationAssetId): AnimationDescriptor | undefined {
    return this.warnIfMissing(this.animations.get(id), id);
  }

  has(id: AssetId): boolean {
    switch (assetCategory(id)) {
      case 'char':
        return this.characters.has(id as CharacterAssetId);
      case 'weapon':
        return this.weapons.has(id as WeaponAssetId);
      case 'vfx':
        return this.vfx.has(id as VfxAssetId);
      case 'prop':
        return this.props.has(id as PropAssetId);
      case 'map':
        return this.maps.has(id as MapAssetId);
      case 'anim':
        return this.animations.has(id as AnimationAssetId);
      default:
        return false;
    }
  }

  /** All registered ids, for tooling/debug overlays. */
  ids(): AssetId[] {
    return [
      ...this.characters.keys(),
      ...this.weapons.keys(),
      ...this.vfx.keys(),
      ...this.props.keys(),
      ...this.maps.keys(),
      ...this.animations.keys(),
    ];
  }

  private warnIfMissing<T>(value: T | undefined, id: AssetId): T | undefined {
    if (!value) console.warn(`[assets] Unknown asset "${id}".`);
    return value;
  }
}

/** Loud magenta capsule shown when a character id can't be resolved. */
function MISSING_CHARACTER(id: CharacterAssetId): CharacterDescriptor {
  return {
    id,
    displayName: 'Missing',
    render: {
      kind: 'placeholder',
      parts: [{ shape: 'capsule', args: [0.5, 0.6, 8, 16], color: '#ff00ff', emissive: '#ff00ff' }],
    },
  };
}

/** Process-wide singleton registry. */
export const assets = new AssetRegistry();
