/**
 * The composable vocabulary of the ability system.
 *
 * An ability is **pure data**: some metadata (cooldown, mana, aim…) plus an
 * ordered list of {@link Effect}s — the *verbs* that actually happen when it
 * resolves. Effects compose: a frostbolt that slows is a `projectile` whose
 * `onHit` is `[damage, status:slow]`; a gap-closer that shields is
 * `[dash, shield]`. Adding a new ability is a single data entry (see
 * `registry.ts`); only a brand-new *mechanic* (rare) adds a handler in the
 * server executor.
 *
 * This module has no dependencies on the rest of the codebase so it can be the
 * shared root both client and server build on.
 */

// ---------------------------------------------------------------------------
// Status effects (buffs / debuffs / crowd control).
// ---------------------------------------------------------------------------

/**
 * The kinds of persistent status a {@link StatusSpec} can apply. Hard CC
 * (`stun`/`root`/`silence`) gates actions; soft modifiers (`slow`/`haste`/
 * `attack_speed`/`damage_amp`) scale a stat by `magnitude`; `dot`/`hot` tick
 * `tickAmount` every `tickMs`; `shield` is an absorb pool (see `Player.shield`).
 */
export type StatusKind =
  | 'stun' // cannot move, cast, or auto-attack
  | 'root' // cannot move (may still cast / attack)
  | 'silence' // cannot cast (may still move)
  | 'blind' // cannot cast abilities or attack (may still move)
  | 'slow' // move speed × magnitude (0..1)
  | 'haste' // move speed × magnitude (>1)
  | 'attack_speed' // auto-attack interval × (1 / magnitude)
  | 'damage_amp' // damage TAKEN × magnitude (>1 = vulnerable)
  | 'empower' // adds `magnitude` flat damage to the carrier's NEXT damaging hit, then consumed
  | 'field' // a damaging aura: ticks `tickAmount` to enemies within `magnitude` of the carrier
  | 'dot' // damage over time (tickAmount every tickMs)
  | 'hot' // heal over time (tickAmount every tickMs)
  | 'shield' // tracks the lifetime of an absorb shield
  | 'poison' // poison damage over time (ticks tickAmount every tickMs, handles spreading)
  | 'buff'; // Buff Core damage + mana regen overcharge buff

/** All status kinds, for iteration/validation. */
export const STATUS_KINDS: readonly StatusKind[] = [
  'stun',
  'root',
  'silence',
  'blind',
  'slow',
  'haste',
  'attack_speed',
  'damage_amp',
  'empower',
  'field',
  'dot',
  'hot',
  'shield',
  'poison',
  'buff',
];

/** A status to apply to a target — authored on an ability, realized on the schema. */
export interface StatusSpec {
  kind: StatusKind;
  /** How long the status lasts, in milliseconds. */
  durationMs: number;
  /**
   * Scalar for stat-modifying kinds: `slow` 0.5 = half speed, `haste` 1.3 =
   * +30% speed, `attack_speed` 1.5 = attacks 50% faster, `damage_amp` 1.2 =
   * takes 20% more. Ignored by gating kinds (stun/root/silence). For `shield`,
   * this is the absorb amount.
   */
  magnitude?: number;
  /** Tick interval for `dot`/`hot`/`field`, in milliseconds. */
  tickMs?: number;
  /** HP changed per tick for `dot`/`hot`/`field`. */
  tickAmount?: number;
  /** For `empower`: restrict the bonus to this ability id (omit = any next hit). */
  ability?: string;
}

// ---------------------------------------------------------------------------
// Effects — the verbs.
// ---------------------------------------------------------------------------

/**
 * Effects that operate on a single "current target" (the player a projectile
 * hit, each enemy inside an AoE, the unit-locked target, or the caster). These
 * are the leaves an `onHit`/`effects` list is built from.
 */
export type LeafEffect =
  | { type: 'damage'; amount: number }
  | { type: 'heal'; amount: number }
  /** Absorb up to `amount` incoming damage for `durationMs` (see `Player.shield`). */
  | { type: 'shield'; amount: number; durationMs: number }
  /** Push the target `distance` units away from the effect origin at `speed` u/s. */
  | { type: 'knockback'; distance: number; speed: number }
  | { type: 'status'; status: StatusSpec };

/**
 * A top-level effect on an ability. Containers (`projectile`, `aoe`) deliver
 * their `onHit` leaves to the targets they find; `dash` moves the caster; a
 * bare {@link LeafEffect} applies to the cast's primary target (the unit-locked
 * target for `aim:'unit'`, otherwise the caster — i.e. self-buffs/heals/shields).
 */
export type Effect =
  | {
      type: 'projectile';
      /** Travel speed, world units/second. */
      speed: number;
      /** Maximum travel distance before it fizzles. */
      range: number;
      /** Collision radius. */
      radius: number;
      /** Visual tag the client maps to a projectile model/VFX. */
      vfx: string;
      /** Effects applied to the first player it collides with. */
      onHit: LeafEffect[];
      /** Fire this many shots in a burst (default 1). Each carries the same
       *  `onHit`; subsequent shots leave the caster's current position. */
      count?: number;
      /** Delay between burst shots, in milliseconds (only used when `count` > 1). */
      intervalMs?: number;
      /** If true, the projectile pierces players — it damages each enemy once and
       *  keeps flying (it still stops on objects/cover). Default: stops on first hit. */
      pierce?: boolean;
      /** Max enemies a piercing projectile hits before it's consumed (the Nth hit
       *  stops it). Only meaningful with `pierce`; omitted = unlimited (pierces all). */
      pierceMax?: number;
    }
  | {
      type: 'aoe';
      /** Where the blast is centered. */
      at: 'caster' | 'point' | 'unit';
      radius: number;
      /** Limit the hit to an arc (degrees) centered on the cast direction; omit
       *  for a full 360° circle. e.g. 180 = a half-disc swung in front. */
      arc?: number;
      /** Optional visual tag for the burst. */
      vfx?: string;
      /** Effects applied to every enemy inside `radius`. */
      onHit: LeafEffect[];
    }
  | {
      /** Heal the caster plus every ALLY (same team) within `radius` of the
       *  centre — the friendly counterpart to `aoe`. */
      type: 'heal_allies';
      at: 'caster' | 'point' | 'unit';
      radius: number;
      amount: number;
    }
  | {
      type: 'dash';
      distance: number;
      speed: number;
      /** Damage dealt to each enemy the dasher ploughs through mid-dash (once each). */
      damage?: number;
      /** Radius of the slam resolved at the landing point (needs `onLand`). */
      impactRadius?: number;
      /** Effects applied to every enemy near where the dash ends (e.g. a charge
       *  that crashes in for damage + knockback). Runs once the lunge completes. */
      onLand?: LeafEffect[];
    }
  | LeafEffect;

// ---------------------------------------------------------------------------
// Aiming + the ability definition.
// ---------------------------------------------------------------------------

/**
 * How an ability is aimed:
 *  - `self`      — instant, no aiming (heals, buffs, point-blank novas).
 *  - `direction` — a skillshot aimed along the cursor (projectiles, dashes).
 *  - `point`     — a ground spot under the cursor (ground-targeted AoE).
 *  - `unit`      — a locked target picked by clicking a player (targeted CC/nukes).
 */
export type AbilityAim = 'self' | 'direction' | 'point' | 'unit';

/**
 * Universal, balance-tunable numbers shared by every ability. Kept flat (and
 * named exactly as before) so the dev-tools tuning panel, the client range
 * indicators, and per-class overrides keep working unchanged. Behavior lives in
 * {@link AbilityDef.effects}; these are cost/timing/reach + display.
 */
export interface AbilityConfig {
  /** Cooldown between casts, in milliseconds. */
  cooldownMs: number;
  /** Mana spent per cast. */
  manaCost: number;
  /** Wind-up before the effect resolves (rooted); `0` resolves instantly. */
  castTimeMs: number;
  /** Effective reach in world units (cast range / ground-target clamp / display). */
  range: number;
  /** Primary damage number — display/tuning only; actual damage lives in effects. */
  damage: number;
  /** Projectile display fields (the on-screen aim indicator reads these). */
  projectileSpeed?: number;
  projectileRange?: number;
  projectileRadius?: number;
  /** Primary heal/AoE display values (tuning/UI only). */
  healAmount?: number;
  aoeRadius?: number;
  /** Channelled abilities (e.g. a sustained beam): total channel duration (ms),
   *  the damage-tick interval (ms), and the beam's width (world units). Presence
   *  of `channelMs` marks the ability as a toggled channel — the server runs it
   *  as a sustained effect (re-press to interrupt), not a one-shot cast. */
  channelMs?: number;
  channelTickMs?: number;
  beamWidth?: number;
  /** How the ability is aimed (drives the client targeting flow). */
  aim?: AbilityAim;
}

/**
 * A complete ability: tunable {@link AbilityConfig} fields + identity + the
 * ordered {@link Effect} list that defines what it does. This is the single
 * shape authored in `registry.ts`.
 */
export interface AbilityDef extends AbilityConfig {
  /** Stable id; also the registry key and the value bound in class loadouts. */
  id: string;
  /** Human-readable name (tooltips, character-select). */
  name: string;
  /** Lucide icon name the client resolves to a glyph (e.g. 'Flame'). */
  icon: string;
  /** What happens when the cast resolves. */
  effects: Effect[];
}
