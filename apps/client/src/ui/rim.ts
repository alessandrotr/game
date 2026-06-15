import { getCosmeticOfType, type RimEffect } from '@arena/shared';

/**
 * Avatar-rim helpers shared by the frame and the level badges/discs that tint
 * themselves to match the equipped rim. Kept out of the component module so
 * fast-refresh stays happy (a file should export only components OR only utils).
 */

/** The resolved look of a rim id (falls back to the standard frame). */
export function resolveRim(rimId?: string): { color: string; color2: string; effect: RimEffect } {
  const rim =
    (rimId ? getCosmeticOfType(rimId, 'rim') : undefined) ?? getCosmeticOfType('rim.standard', 'rim');
  const color = rim?.color ?? '#9aa3b8';
  return { color, color2: rim?.color2 ?? color, effect: (rim?.effect ?? 'solid') as RimEffect };
}

/** The equipped rim's primary color — for tinting level badges / discs to match
 *  the frame wherever an `AvatarFrame` isn't used directly (HUD, player card). */
export function rimColorOf(rimId?: string): string {
  return resolveRim(rimId).color;
}

/** The ring paint for a rim effect. Prismatic uses a rainbow that the
 *  `.rim-prismatic` hue-rotate animation cycles around the circle. */
export function ringPaint(effect: RimEffect, color: string, color2: string): string {
  if (effect === 'prismatic')
    return 'conic-gradient(from 0deg, #ff4d8d, #ffd24a, #4dffa3, #4a8bff, #b14aff, #ff4d8d)';
  if (effect === 'gradient') return `linear-gradient(135deg, ${color}, ${color2})`;
  return color; // solid / pulse
}
