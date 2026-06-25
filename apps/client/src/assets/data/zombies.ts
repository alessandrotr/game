import type { PlaceholderPart } from '@arena/shared';

/**
 * Zombie bodies — built from the SAME primitive system as the player characters
 * (see `humanoid.ts`), so the horde renders on the zero-cost placeholder path
 * (no skeleton, no skinning, no animation mixer) instead of dozens of rigged
 * GLBs. Local space matches `humanoid()`: origin at the feet (y = 0 is ground),
 * the figure faces +z. Variants differ by breadth (`bulk`), color, eye glow, and
 * how far they hunch forward — enough to read each one apart in a dense horde.
 *
 * Differs from `humanoid()` only in that zombies need a sickly recolored head
 * (the player builder hardcodes a skin tone) and a forward-reaching pose, so the
 * parts are assembled here directly while mirroring the player's proportions.
 */

export type ZombieVariant = 'standard' | 'sprinter' | 'fat' | 'miniboss';

interface ZombieStyle {
  /** Body breadth multiplier: 1 = average, >1 broader (fat), <1 leaner (sprinter). */
  bulk: number;
  /** Torso color. */
  body: string;
  /** Head color. */
  head: string;
  /** Emissive eye color — the glow that signals the variant at a glance. */
  eye: string;
  /** Forward hunch, in radians (torso tilt + head juts forward). */
  lean: number;
}

/** Per-variant look. Sickly grave-greens for the rank-and-file Risen; the
 *  sprinter is a pale grey, red-eyed wight (reads as "fast/dangerous"), the fat
 *  is a bloated olive hulk, and the miniboss is a darker rot with red eyes — the
 *  Dread Knight (it's also scaled up at render). */
const STYLES: Record<ZombieVariant, ZombieStyle> = {
  standard: { bulk: 1.0, body: '#6b7a52', head: '#7c8a5e', eye: '#d8e84a', lean: 0.16 },
  sprinter: { bulk: 0.8, body: '#7a7360', head: '#8a8163', eye: '#ff0d05', lean: 0.34 },
  fat: { bulk: 1.55, body: '#5d6e42', head: '#6e7d4f', eye: '#c9d18a', lean: 0.1 },
  miniboss: { bulk: 1.2, body: '#46512f', head: '#55603a', eye: '#ff3326', lean: 0.2 },
};

/** The mini-boss berserk look — when it drops below half HP the server speeds it
 *  up; this is the matching visual cue (a furious red), replacing the old GLB
 *  rage tint. Eyes burn brighter too. */
const RAGE: ZombieStyle = { bulk: 1.2, body: '#8a2c20', head: '#a33729', eye: '#ff2a14', lean: 0.2 };

// Body capsule geometry (mirrors humanoid): radius scales with bulk, the cylinder
// section is fixed, centered at this height. The head then rides just above the
// torso's actual top so a wide (fat) body never swallows it.
const BODY_RADIUS_BASE = 0.36;
const BODY_HALF_LENGTH = 0.31; // capsule cylinder half-height (length 0.62 / 2)
const BODY_CENTER_Y = 0.78;
const HEAD_RADIUS = 0.27;

/** Two capsule arms reaching forward (the classic outstretched zombie pose),
 *  angled down a touch. Anchored just outside the torso so wide bodies don't
 *  bury them, scaled out with body breadth. */
function arms(bodyRadius: number, color: string): PlaceholderPart[] {
  const shoulderX = bodyRadius + 0.1; // clear the torso surface
  // Rotate the (y-axis) capsule to point roughly forward (+z) and slightly down.
  const reach: [number, number, number] = [Math.PI / 2 - 0.35, 0, 0];
  return [
    {
      name: 'arm.l',
      shape: 'capsule',
      args: [0.09, 0.42, 6, 10],
      position: [-shoulderX, 1.12, 0.2],
      rotation: reach,
      color,
      roughness: 0.85,
    },
    {
      name: 'arm.r',
      shape: 'capsule',
      args: [0.09, 0.42, 6, 10],
      position: [shoulderX, 1.12, 0.2],
      rotation: reach,
      color,
      roughness: 0.85,
    },
  ];
}

/** Two small emissive eyes on the front of the (forward-jutting) head. */
function eyes(headY: number, headZ: number, color: string): PlaceholderPart[] {
  const part = (name: string, x: number): PlaceholderPart => ({
    name,
    shape: 'sphere',
    args: [0.045, 8, 8],
    position: [x, headY + 0.02, headZ + 0.22],
    color,
    emissive: color,
    emissiveIntensity: 1.8,
    roughness: 0.4,
  });
  return [part('eye.l', -0.1), part('eye.r', 0.1)];
}

/** Assemble a zombie body for the given variant — a hunched torso, a forward
 *  head with glowing eyes, and outstretched arms, sized by the variant's bulk.
 *  `raged` swaps the mini-boss to its berserk red palette. Shadows are forced off
 *  (the horde renders cheap, as the old rigged zombies did via `lightweight`). */
export function zombieBody(variant: ZombieVariant, opts?: { raged?: boolean }): PlaceholderPart[] {
  const s = opts?.raged ? RAGE : STYLES[variant];
  const sx = s.bulk;
  const bodyRadius = BODY_RADIUS_BASE * sx;
  // Head sits just above the torso's actual top (so a bloated fat body can't
  // engulf it), juts forward with the hunch, and dips a touch.
  const bodyTop = BODY_CENTER_Y + BODY_HALF_LENGTH + bodyRadius;
  const headY = bodyTop + 0.08 - s.lean * 0.2;
  const headZ = s.lean * 0.95;

  const parts: PlaceholderPart[] = [
    {
      name: 'body',
      shape: 'capsule',
      args: [bodyRadius, 0.62, 8, 16],
      position: [0, BODY_CENTER_Y, 0],
      rotation: [s.lean, 0, 0], // hunch the torso forward
      color: s.body,
      roughness: 0.85,
    },
    {
      name: 'head',
      shape: 'sphere',
      args: [HEAD_RADIUS, 18, 18],
      position: [0, headY, headZ],
      color: s.head,
      roughness: 0.8,
    },
    ...eyes(headY, headZ, s.eye),
    ...arms(bodyRadius, s.body),
  ];

  // Force shadows off across the whole figure — dozens of casters would flood the
  // shadow pass; this matches the perf profile of the retired `lightweight` GLBs.
  return parts.map((p) => ({ ...p, castShadow: false, receiveShadow: false }));
}
