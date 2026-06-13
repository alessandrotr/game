/**
 * Destructible environment objects — the ONE place to tune their physics.
 *
 * These props are simulated with a REAL rigid-body engine (Rapier) on the
 * server — see `apps/server/src/rooms/arena/destructibles.ts`. The server owns
 * the physics world (gravity, contacts, friction, sleeping) and replicates each
 * body's transform (position + orientation quaternion) via the schema, so every
 * client sees identical motion and late joiners get the current state. Clients
 * do NOT run physics (that would desync); they just render the synced transform.
 *
 * IMPORTANT: these objects do NOT explode — they roll, tumble, fall and settle.
 * The only damage they deal is a small impact when a fast-moving one strikes a
 * player. Two categories — tires and oil drums — each tuned separately.
 */

/** Fine-grained object type — drives the client visual. */
export type DestructibleKind = 'tire' | 'barrel';

/** Physics-tuning buckets (a kind maps to one of these). */
export type DestructibleCategory = 'tire' | 'barrel';

/** Map a fine-grained kind to its physics category. */
export function categoryOf(kind: DestructibleKind): DestructibleCategory {
  return kind === 'tire' ? 'tire' : 'barrel';
}

/** Per-category physics tuning (fed straight into the Rapier body/collider). */
export interface DestructibleCategoryConfig {
  /** Body mass (kg-ish). Heavier → a given impulse moves it less. */
  mass: number;
  /** Collider friction (0..1+) — the main thing that stops a sliding/rolling body. */
  friction: number;
  /** Collider restitution (bounciness, 0..1). Keep low so props don't bounce. */
  restitution: number;
  /** Rapier linear damping (per-second) — gentle air drag on top of friction. */
  linearDamping: number;
  /** Rapier angular damping (per-second) — bleeds off spin so it settles. */
  angularDamping: number;
  /** Horizontal impulse applied on a clean spell hit (mass·u/s). Tuned so the
   *  body travels roughly {@link targetMoveDistance} before friction stops it. */
  hitImpulse: number;
  /** Upward impulse on a hit (mass·u/s) — a small pop so a struck pile separates
   *  and tumbles instead of just sliding. Kept low (controlled, not a launch). */
  popImpulse: number;
  /** Hard cap on a single applied impulse (mass·u/s) — never over-launch. */
  maxImpulse: number;
  /** Minimum time (ms) between spell impulses on the SAME body. */
  cooldownMs: number;
  /** Collider radius (also the horizontal footprint for player-impact checks). */
  radius: number;
  /** Collider half-height (cylinder). Tire = thin disc; drum = tall. */
  halfHeight: number;
  /** Approximate rest distance (world units) a clean hit should move it — a
   *  design target the impulse is tuned toward (friction makes it approximate). */
  targetMoveDistance: number;
}

/**
 * Per-category tuning. Headline design targets: a clean hit rolls a tire pile
 * apart by ~6u and shoves a drum ~4u. With a real engine the distance isn't a
 * closed-form of the impulse (friction + contacts decide it), so `hitImpulse`
 * is tuned toward `targetMoveDistance` and is the first knob to adjust by feel.
 */
export const DESTRUCTIBLE_CONFIG: Record<DestructibleCategory, DestructibleCategoryConfig> = {
  // Light disc: pops, fans out and rolls (a stack scatters ~4–8u), settles flat.
  // It's very mobile (rolls on its edge), so it needs only a modest impulse.
  tire: {
    mass: 1.2,
    friction: 0.7,
    restitution: 0.2,
    linearDamping: 0.35,
    angularDamping: 0.6,
    hitImpulse: 12,
    popImpulse: 5,
    maxImpulse: 18,
    cooldownMs: 350,
    radius: 0.45,
    halfHeight: 0.18,
    targetMoveDistance: 6,
  },
  // Heavier drum: shoves/rolls ~4u and settles. High angular damping is REQUIRED
  // — a cylinder tipped onto its side rolls almost forever (and can run off the
  // map), so we damp spin hard to keep the motion controlled. Never detonates.
  barrel: {
    mass: 2.2,
    friction: 0.8,
    restitution: 0.1,
    linearDamping: 0.6,
    angularDamping: 2.5,
    hitImpulse: 16,
    popImpulse: 2.5,
    maxImpulse: 22,
    cooldownMs: 400,
    radius: 0.4,
    halfHeight: 0.5,
    targetMoveDistance: 4,
  },
};

// --- World physics ---

/** Downward gravity for the props' physics world (u/s²). A touch stronger than
 *  Earth so pieces settle quickly and feel weighty in the low-poly arena. */
export const DESTRUCTIBLE_GRAVITY = 20;

/** Half-extent of the arena floor; props can't slide past the perimeter walls. */
export const DESTRUCTIBLE_BOUND = 24.5;

// --- Player impact damage (server-authoritative) ---

/** Flat damage a fast-moving destructible deals to a player it strikes. */
export const IMPACT_DAMAGE_TO_PLAYER = 5;
/** Minimum body speed (u/s) to deal impact damage — tiny nudges don't hurt. */
export const MIN_DAMAGE_VELOCITY = 4;
/** Per (body, player) cooldown (ms) so one object can't tick 5 dmg every frame. */
export const DAMAGE_COOLDOWN_MS = 700;

// --- Tire stack ---

/** Tires in a standard stack (separate bodies, physically stacked). */
export const TIRE_STACK_COUNT = 3;
/** Tire body radius (outer) and tube thickness — also the rendered torus dims. */
export const TIRE_RADIUS = 0.45;
export const TIRE_TUBE = 0.18;
/** Vertical spacing between stacked tires at spawn (≥ a full tire height so they
 *  don't interpenetrate before physics settles them into a pile). */
export const TIRE_STACK_SPACING = 0.38;

// --- Oil drums ---

/** Oil-drum body radius and half-height — matches the `prop.arena.drum` model
 *  (a 1-unit-tall, ~0.4-radius rusted drum). */
export const DRUM_RADIUS = 0.4;
export const DRUM_HALF_HEIGHT = 0.5;
