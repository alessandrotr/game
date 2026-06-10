import { assets } from '../registry';
import { CHARACTERS } from './characters';
import { WEAPONS } from './weapons';
import { PROPS } from './props';
import { VFX } from './vfx';
import { MAPS } from './maps';
import { ANIMATIONS } from './animations';

let registered = false;

/**
 * Populate the singleton registry with all built-in placeholder assets.
 * Idempotent — safe to call from app bootstrap (and under React StrictMode).
 */
export function registerBuiltInAssets(): void {
  if (registered) return;
  registered = true;

  ANIMATIONS.forEach((a) => assets.registerAnimation(a));
  WEAPONS.forEach((w) => assets.registerWeapon(w));
  CHARACTERS.forEach((c) => assets.registerCharacter(c));
  PROPS.forEach((p) => assets.registerProp(p));
  VFX.forEach((v) => assets.registerVfx(v));
  MAPS.forEach((m) => assets.registerMap(m));
}
