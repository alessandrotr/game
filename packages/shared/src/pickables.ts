/**
 * Pickable objects — a distinct category from the QWER ability kit: world items a
 * player walks up to, grabs (spacebar), carries over their head, and hurls
 * (spacebar again) in the direction they're facing. They burst on impact and, for
 * the molotov, leave a burning puddle behind.
 *
 * Like {@link ABILITY_REGISTRY}, this is pure data: the single edit point for a
 * pickable's reach, burst, and lingering field. The server's pickable + ground-zone
 * systems and the client's render/VFX are driven entirely off these definitions.
 */

/** Every pickable object kind (the registry keys, as a literal union). */
export type PickableKind = 'molotov' | 'grenade';

/** The instant blast a thrown pickable deals where it lands. */
export interface PickableImpact {
  /** Blast radius (world units) — VFX is sized to match this. */
  radius: number;
  /** Direct damage to everyone caught in the blast. */
  damage: number;
}

/** A lingering damaging puddle left on the ground after impact (molotov only). */
export interface PickablePuddle {
  /** Puddle radius (world units) — VFX is sized to match this. */
  radius: number;
  /** Damage dealt to enemies inside the puddle every `tickMs`. */
  tickDamage: number;
  /** Tick interval, in milliseconds. */
  tickMs: number;
  /** How long the puddle lasts before it disappears, in milliseconds. */
  durationMs: number;
}

/** A complete pickable object definition. */
export interface PickableDef {
  id: PickableKind;
  /** Human-readable name (HUD prompt / tooltips). */
  name: string;
  /** Maximum throw distance, in world units. */
  throwRange: number;
  /** Travel speed of the thrown object, in world units/second. */
  throwSpeed: number;
  /** Collision radius of the object in flight. */
  projectileRadius: number;
  /** The burst dealt at the impact point. */
  impact: PickableImpact;
  /** Optional lingering ground puddle (molotov). */
  puddle?: PickablePuddle;
}

/** THE pickable catalog — one entry per kind. */
export const PICKABLES: Record<PickableKind, PickableDef> = {
  // Burst-on-impact (4 radius / 12 dmg), then a burning puddle (4 radius) that
  // ticks 6 every 0.5s for 2s before it disappears.
  molotov: {
    id: 'molotov',
    name: 'Molotov',
    throwRange: 14,
    throwSpeed: 18,
    projectileRadius: 0.5,
    impact: { radius: 4, damage: 12 },
    puddle: { radius: 4, tickDamage: 5, tickMs: 500, durationMs: 5000 },
  },
  // A bigger one-shot burst (6 radius / 32 dmg), no lingering field.
  grenade: {
    id: 'grenade',
    name: 'Grenade',
    throwRange: 14,
    throwSpeed: 20,
    projectileRadius: 0.5,
    impact: { radius: 6, damage: 32 },
  },
};

/** All pickable kinds, for iteration / random selection. */
export const PICKABLE_KINDS = Object.keys(PICKABLES) as PickableKind[];

/** Runtime guard: is `value` a known pickable kind? */
export function isPickableKind(value: unknown): value is PickableKind {
  return typeof value === 'string' && value in PICKABLES;
}

/** Chance an oil drum drops a pickable when it runs out of HP. */
export const PICKABLE_DROP_CHANCE = 0.5;

/** How close (world units) a player must be to grab a pickable off the ground. */
export const PICKABLE_PICKUP_RADIUS = 1.8;

/** A pickable left on the ground disappears after this long if nobody grabs it. */
export const PICKABLE_GROUND_TTL_MS = 45000;

/** Render height (world units) a carried object floats at, over the player's head. */
export const PICKABLE_CARRY_Y = 2.5;

/** Resting height of a pickable sitting on the ground. */
export const PICKABLE_GROUND_Y = 0.45;
