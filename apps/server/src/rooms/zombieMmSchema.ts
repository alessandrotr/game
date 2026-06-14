import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

/**
 * Replicated state for the co-op Zombie matchmaking room. A singleton
 * {@link ZombieMatchmakingRoom} owns one of these; clients connect to it alongside
 * the town room and read the squad-lobby list + detail from schema sync. Mirrors
 * the `ZombieLobbyView`/`ZombieLobbySlotView` shapes in `@arena/shared`.
 */

/** One member seat in a co-op zombie lobby (always occupied — seats aren't
 *  pre-allocated; members are pushed/spliced as they join/leave). */
export class ZombieLobbySlot extends Schema {
  /** Matchmaking-room session id of the occupant. */
  @type('string') sessionId = '';
  @type('string') name = '';
  @type('string') characterClass = 'warrior';
  /** Join order (0 = host). */
  @type('number') index = 0;
}

/** A co-op zombie squad lobby: its name, host, privacy, and members. */
export class ZombieLobby extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  /** Matchmaking-room session id of the host (who can start the run). */
  @type('string') hostId = '';
  /** Private lobbies are hidden from the browser and joined only via `code`. */
  @type('boolean') isPrivate = false;
  /** Share code for a private lobby ('' for public). */
  @type('string') code = '';
  /** 'queuing' | 'playing'. */
  @type('string') status = 'queuing';
  /** Zombie room id once the run starts (server-only use; replicated harmlessly). */
  @type('string') roomId = '';
  @type([ZombieLobbySlot]) members = new ArraySchema<ZombieLobbySlot>();
}

/** Root state: every live co-op zombie lobby, keyed by lobby id. */
export class ZombieMatchmakingState extends Schema {
  @type({ map: ZombieLobby }) lobbies = new MapSchema<ZombieLobby>();
}
