import { Schema, MapSchema, type } from '@colyseus/schema';
import { PLAYER_MAX_HP, PLAYER_MAX_MANA } from '@arena/shared';

/**
 * Authoritative per-player state. Field order and types must stay in sync with
 * `PlayerView` in `@arena/shared` so the client can read replicated state safely.
 */
export class Player extends Schema {
  @type('string') sessionId = '';
  @type('string') name = 'Adventurer';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') rotation = 0;
  @type('number') hp = PLAYER_MAX_HP;
  @type('number') maxHp = PLAYER_MAX_HP;
  @type('number') mana = PLAYER_MAX_MANA;
  @type('number') maxMana = PLAYER_MAX_MANA;
  @type('boolean') alive = true;
  /** Playable class id; the client maps this to a character asset. */
  @type('string') characterClass = 'warrior';
  /** Optional skin asset id layered on top of the class appearance. */
  @type('string') skinId = '';
  /**
   * Authoritative animation state (idle/run/attack/cast/hit/die). Remote clients
   * play this directly; the local client predicts its own for responsiveness.
   */
  @type('string') animState = 'idle';
  /** Session id this player is auto-attacking ('' if none). Replicated so every
   *  client can show an "is attacking you/<name>" banner over the target. */
  @type('string') attackTargetId = '';
}

/** Authoritative in-flight projectile, mirrors `ProjectileView` in `@arena/shared`. */
export class Projectile extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') ability = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
}

/** Authoritative arena room state, mirrors `ArenaStateView` in `@arena/shared`. */
export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type('number') tick = 0;
}
