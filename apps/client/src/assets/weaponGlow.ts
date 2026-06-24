import { Euler, Vector3 } from 'three';
import type { WeaponDescriptor } from '@arena/shared';

/**
 * The "glow color" of a weapon — the hue of its magical showpiece (a staff orb,
 * a censer sun, an arcane core). One source of truth shared by the weapon's cast
 * flare (CharacterModel) and the ability VFX tint (projectiles + bursts), so an
 * equipped weapon skin recolors both consistently.
 */

export interface WeaponGlow {
  /** The showpiece's glow color (its emissive, else its base color). */
  color: string;
  /** Local position of the showpiece within the weapon model. */
  position: [number, number, number];
  /** Showpiece radius (drives the flare size). */
  radius: number;
}

/** Relative luminance of a `#rrggbb` color (rough, color-management agnostic). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return 0;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Finds a weapon's glowing showpiece — the "ball on top". Among the model's
 * spheres/torii, scores each by how bright and large it is (emissive parts
 * weighted heavily, since those are the magic bits) and picks the winner.
 * Returns null for weapons with no such part (most swords) or rigged models.
 */
export function weaponGlowPart(weapon: WeaponDescriptor): WeaponGlow | null {
  if (weapon.render.kind !== 'placeholder') return null;
  let best: WeaponGlow | null = null;
  let bestScore = 0;
  for (const part of weapon.render.parts) {
    if (part.shape !== 'sphere' && part.shape !== 'torus') continue;
    const lit = part.emissive && part.emissive !== '#000000';
    const glowColor = lit ? part.emissive! : part.color;
    if (!glowColor) continue;
    const radius = part.args?.[0] ?? 0.12;
    const score = (lit ? 3 : 1) * luminance(glowColor) * radius;
    if (score <= bestScore) continue;
    bestScore = score;
    best = { color: glowColor, position: part.position ?? [0, 0, 0], radius };
  }
  return best;
}

/** Minimum showpiece brightness for a weapon to color its abilities — the
 *  white/gray caster orbs pass; a dull nub (a plain bow's dark nock) doesn't, so
 *  those classes keep their authored ability colors. */
const TINT_LUMINANCE_FLOOR = 0.22;

/** The color a weapon imparts to its ability VFX (its showpiece color), or null
 *  if it has no bright enough showpiece. For the default (un-enchanted) weapons
 *  this is the neutral white/gray, so default abilities read white/gray too. */
export function weaponTintColor(weapon: WeaponDescriptor): string | null {
  const glow = weaponGlowPart(weapon);
  if (!glow || luminance(glow.color) < TINT_LUMINANCE_FLOOR) return null;
  return glow.color;
}

const _v = new Vector3();
const _eu = new Euler();

/**
 * The showpiece's position in BODY-LOCAL space (the player's frame, +Z = facing)
 * — i.e. where the orb/head sits relative to the character's feet at rest. Used as
 * the muzzle so abilities emanate from the scepter tip. Returns null for weapons
 * with no showpiece. Folds the orb's local position through the weapon's grip
 * transform (rotation + scale + position).
 */
export function weaponMuzzleOffset(weapon: WeaponDescriptor): [number, number, number] | null {
  const glow = weaponGlowPart(weapon);
  if (!glow) return null;
  const grip = weapon.grip;
  const scale = grip?.scale ?? 1;
  _v.set(glow.position[0] * scale, glow.position[1] * scale, glow.position[2] * scale);
  if (grip?.rotation) {
    _eu.set(grip.rotation[0], grip.rotation[1], grip.rotation[2]);
    _v.applyEuler(_eu);
  }
  return [_v.x + (grip?.position?.[0] ?? 0), _v.y + (grip?.position?.[1] ?? 0), _v.z + (grip?.position?.[2] ?? 0)];
}
