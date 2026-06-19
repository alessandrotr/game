import type { PlaceholderPart } from '@arena/shared';

/** The neutral blank-canvas color shared by every character's head + body — the
 *  surface the player paints on. Kept here so the paint engine seeds new canvases
 *  with the exact same base. */
export const BODY_BASE_COLOR = '#cfd3da';

/**
 * Character body builder. Assembles a stylized figure from a compact spec, so
 * every character is stamped from one shared template instead of hand-placed
 * primitives. The body is deliberately minimal — a rounded capsule BODY, a HEAD
 * with eyes, and two FEET poking out the bottom (no arms or legs). Local space
 * has the origin at the feet (y = 0 is the ground) and the figure faces +z.
 *
 * The spec is shaped as a COSMETIC-SLOT model so the planned unlock store can
 * drive it directly: a store item is just a value for a slot (`palette` dyes,
 * `headgear`, `accessories`). Equipping a cosmetic later == swapping the slot
 * input here; the body geometry and the renderer stay untouched.
 */

/** Recolorable dyes. Each is its own potential store category. */
export interface HumanoidPalette {
  /** Base color shared by the head and body — the paintable surface. */
  primary: string;
  /** Trim / accents / secondary. */
  secondary: string;
  /** Metallic bits (buckles, plate); falls back to `secondary`. */
  metal?: string;
}

export interface HumanoidSpec {
  palette: HumanoidPalette;
  /** Body breadth multiplier: 1 = average, >1 broader, <1 leaner. */
  bulk?: number;
  /** Headgear slot — helmet / hat / hood / crown parts, layered over the head. */
  headgear?: PlaceholderPart[];
  /** Accessory slot — capes, packs, quivers, halos. */
  accessories?: PlaceholderPart[];
}

export function humanoid(spec: HumanoidSpec): PlaceholderPart[] {
  const { palette, bulk = 1, headgear = [], accessories = [] } = spec;
  const sx = bulk; // breadth scale: widens the body without lengthening it
  const headY = 1.5;

  return [
    // Head + body share one flat color — the blank canvas the player paints on.
    {
      name: 'body',
      shape: 'capsule',
      args: [0.36 * sx, 0.62, 8, 16],
      position: [0, 0.78, 0],
      color: palette.primary,
      roughness: 0.7,
    },
    { name: 'head', shape: 'sphere', args: [0.27, 18, 18], position: [0, headY, 0], color: palette.primary },

    ...accessories,
    ...headgear,
  ];
}
