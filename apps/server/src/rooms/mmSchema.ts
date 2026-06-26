import { MapSchema, Schema, type } from '@colyseus/schema';

/**
 * Replicated PvP matchmaking state: a flat queue of players waiting for a format.
 * A singleton {@link MatchmakingRoom} owns one; clients connect to it alongside
 * the town room and read the queue straight from schema sync — the client→server
 * messages are pure intents (join/leave queue, invite, respond). The client counts
 * members per `mode` for the queue badge and finds its own entry by matchmaking
 * session id. Mirrors the `QueueMemberView` shape in `@arena/shared`.
 */

/** One player waiting in a format queue. */
export class QueueMember extends Schema {
  /** Matchmaking-room session id of the queued player. */
  @type('string') sessionId = '';
  /** TOWN-room session id (lets peers match this against a paperdoll target). */
  @type('string') townSessionId = '';
  /** The format being queued for (a shared `LobbyMode`: '1v1'…'5v5'). */
  @type('string') mode = '1v1';
  /** Shared id for a party that must land on the SAME team (invite groups);
   *  '' for a solo queuer. */
  @type('string') partyId = '';
  /** Sim-time (ms) this player joined the queue — drives the bot-fill countdown. */
  @type('number') enqueuedAt = 0;
}

/** Root matchmaking state: every queued player, keyed by matchmaking session id. */
export class MatchmakingState extends Schema {
  @type({ map: QueueMember }) members = new MapSchema<QueueMember>();
}
