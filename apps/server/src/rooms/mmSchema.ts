import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

/**
 * Replicated matchmaking state for the lobby browser (Phase 12). A singleton
 * {@link MatchmakingRoom} owns one of these; clients connect to it alongside the
 * town room and read the lobby list, lobby detail, and ready-check straight from
 * schema sync — the client→server messages are pure intents. Mirrors the
 * `LobbyView`/`LobbySlotView` shapes in `@arena/shared`.
 */

/** One team slot in a lobby. `sessionId === ''` means the slot is open. */
export class LobbySlot extends Schema {
  /** Matchmaking-room session id of the occupant, or '' if empty. */
  @type('string') sessionId = '';
  @type('string') name = '';
  @type('string') characterClass = 'warrior';
  /** 'blue' | 'red' — fixed by which team array the slot lives in. */
  @type('string') team = 'blue';
  /** Position within the team column (0-based). */
  @type('number') index = 0;
  /** Whether the occupant has accepted the ready-check. */
  @type('boolean') accepted = false;
}

/** A single lobby: its mode, status, host, ready-check deadline, and team slots. */
export class Lobby extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  /** One of the shared `LOBBY_MODES` ('1v1'…'5v5'). */
  @type('string') mode = '1v1';
  /** 'queuing' | 'ready_check' | 'playing'. */
  @type('string') status = 'queuing';
  /** Sim-time (ms) the ready-check expires at; 0 when not in ready_check. */
  @type('number') readyDeadline = 0;
  /** Matchmaking-room session id of the host. */
  @type('string') hostId = '';
  /** Arena room id once the match starts (server-only use; replicated harmlessly). */
  @type('string') arenaRoomId = '';
  @type([LobbySlot]) blue = new ArraySchema<LobbySlot>();
  @type([LobbySlot]) red = new ArraySchema<LobbySlot>();
}

/** Root matchmaking state: every live lobby, keyed by lobby id. */
export class MatchmakingState extends Schema {
  @type({ map: Lobby }) lobbies = new MapSchema<Lobby>();
}
