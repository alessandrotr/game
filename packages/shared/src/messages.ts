/**
 * Strongly-typed message contracts exchanged over the Colyseus channel.
 *
 * Client → Server messages carry player intent; the server validates and applies
 * them authoritatively. Server → Client gameplay state is replicated via schema
 * sync, so explicit server messages are reserved for discrete events (casts,
 * damage) that drive transient client feedback.
 */

import type { AbilityConfig, AbilityKind, LobbyMode, Team } from './constants.js';
import type { CharacterClass } from './assets.js';
import type { ClassStats } from './classes.js';
import type { ChatMessage } from './chat.js';

/** AI skill level for practice bots, from sloppy auto-attacker to full kit. */
export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Message identifiers sent from client to server. */
export enum ClientMessage {
  /** Set/update the world-space point to move toward (hold-to-move). */
  MoveTo = 'move_to',
  /** Stop mouse-driven movement immediately (right mouse button released). */
  StopMove = 'stop_move',
  /** Request a jump; the server applies it only when grounded. */
  Jump = 'jump',
  /** Set the auto-attack target (a player session id); attack-move toward it. */
  Attack = 'attack',
  /** Request to cast an ability in a direction. */
  CastAbility = 'cast_ability',
  /** Set or change the player's display name. */
  SetName = 'set_name',
  /** Send a global chat message to everyone in the room. */
  Chat = 'chat',
  /** Matchmaking: create a new lobby (name + mode). */
  CreateLobby = 'create_lobby',
  /** Matchmaking: take a specific team slot in an open lobby. */
  JoinSlot = 'join_slot',
  /** Matchmaking: leave the lobby you're currently in. */
  LeaveLobby = 'leave_lobby',
  /** Matchmaking: accept the ready-check for your full lobby. */
  AcceptMatch = 'accept_match',
  /** Matchmaking: decline the ready-check (returns others to the open lobby). */
  DeclineMatch = 'decline_match',
  /** Dev-only: live-tune authoritative movement "feel" for the room. */
  DevTune = 'dev_tune',
  /** Dev-only: live-tune ability balance (global base and/or per-class overrides). */
  AbilityTune = 'ability_tune',
  /** Dev-only: live-tune per-class stats (HP / mana / move speed / attack). */
  StatTune = 'stat_tune',
  /** Dev-only: set the arena's practice-bot population and AI difficulty. */
  BotControl = 'bot_control',
  /** Ask the server for the global leaderboard (town only). */
  RequestLeaderboard = 'request_leaderboard',
  /** Play an emote (dance) — replicated so everyone sees it. */
  Emote = 'emote',
}

/** Message identifiers sent from server to client (discrete events, not state sync). */
export enum ServerMessage {
  /** Sent once to the joining client with its identity and the world seed. */
  Welcome = 'welcome',
  /** An ability was cast (drives transient cast/impact VFX on clients). */
  AbilityCast = 'ability_cast',
  /** A player dealt damage to another player. */
  Damage = 'damage',
  /** A player was healed (drives healing combat text). */
  Heal = 'heal',
  /** A chat message was broadcast to the room. */
  Chat = 'chat',
  /** Recent chat history, sent to a client when it joins. */
  ChatHistory = 'chat_history',
  /** A matchmaking intent was rejected (validation, race, full, etc.). */
  LobbyError = 'lobby_error',
  /** A match was found — carries a seat reservation to consume into the arena. */
  MatchFound = 'match_found',
  /** A ranked match ended — carries the winner and final scoreboard. */
  MatchOver = 'match_over',
  /** The global leaderboard, sent in reply to {@link ClientMessage.RequestLeaderboard}. */
  Leaderboard = 'leaderboard',
  /** A player gained a level (drives the level-up flourish + HUD toast). */
  LevelUp = 'level_up',
}

/** A player's line on the end-of-match scoreboard. */
export interface MatchScore {
  /** Session id of the player (compare against the local id to find yourself). */
  id: string;
  name: string;
  /** Side this player fought for (groups the scoreboard into Blue/Red). */
  team: Team;
  kills: number;
  deaths: number;
}

/** One ranked row on the global leaderboard (a player's progress for a class). */
export interface LeaderboardEntry {
  name: string;
  characterClass: string;
  level: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
}

/** Payload map for {@link ClientMessage}. */
export interface ClientMessagePayloads {
  [ClientMessage.MoveTo]: { x: number; z: number };
  [ClientMessage.StopMove]: Record<string, never>;
  [ClientMessage.Jump]: Record<string, never>;
  [ClientMessage.Attack]: { targetId: string };
  [ClientMessage.CastAbility]: {
    ability: AbilityKind;
    dirX: number;
    dirZ: number;
    /** Ground-target point (ground-targeted abilities only). */
    tx?: number;
    tz?: number;
    /** Locked target's session id (unit-targeted abilities only). */
    targetId?: string;
  };
  [ClientMessage.SetName]: { name: string };
  [ClientMessage.Chat]: { text: string };
  [ClientMessage.CreateLobby]: { name: string; mode: LobbyMode };
  [ClientMessage.JoinSlot]: { lobbyId: string; team: Team; index: number };
  [ClientMessage.LeaveLobby]: Record<string, never>;
  [ClientMessage.AcceptMatch]: Record<string, never>;
  [ClientMessage.DeclineMatch]: Record<string, never>;
  [ClientMessage.RequestLeaderboard]: Record<string, never>;
  [ClientMessage.Emote]: { emote: string };
  /** Movement "feel" overrides (global). Walk speed is the per-class stat. */
  [ClientMessage.DevTune]: {
    jumpForce: number;
    stoppingDistance: number;
    rotationSpeed: number;
  };
  /**
   * Ability balance overrides, in the server's own units (ms, world units):
   * `global` patches the shared base; `perClass` patches a single class's copy.
   */
  [ClientMessage.AbilityTune]: {
    global?: Partial<Record<AbilityKind, Partial<AbilityConfig>>>;
    perClass?: Partial<Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>>;
  };
  /** Per-class stat overrides (HP / mana / move speed / attack). */
  [ClientMessage.StatTune]: Partial<Record<CharacterClass, Partial<ClassStats>>>;
  /** Reconcile the arena's practice-bot population to `count` at `difficulty`.
   *  `characterClass` pins every bot to one class (else each rolls a random one). */
  [ClientMessage.BotControl]: {
    count: number;
    difficulty: BotDifficulty;
    characterClass?: CharacterClass;
  };
}

/** Payload map for {@link ServerMessage}. */
export interface ServerMessagePayloads {
  [ServerMessage.Welcome]: { sessionId: string; worldSeed: number };
  [ServerMessage.AbilityCast]: {
    casterId: string;
    ability: AbilityKind;
    x: number;
    y: number;
    z: number;
    dirX: number;
    dirZ: number;
    /** Resolved impact point for ground-targeted abilities (else absent). */
    tx?: number;
    tz?: number;
    /** Locked target's session id for unit-targeted abilities (else absent). */
    targetId?: string;
  };
  [ServerMessage.Damage]: { from: string; to: string; amount: number; lethal: boolean };
  [ServerMessage.Heal]: { to: string; amount: number };
  [ServerMessage.Chat]: ChatMessage;
  [ServerMessage.ChatHistory]: { messages: ChatMessage[] };
  [ServerMessage.LobbyError]: { code: string; message: string };
  /** `reservation` is a Colyseus seat reservation passed straight to
   *  `client.consumeSeatReservation()` — its internal shape is opaque to us. */
  [ServerMessage.MatchFound]: { reservation: unknown };
  [ServerMessage.MatchOver]: {
    /** Side that won the match. */
    winnerTeam: Team;
    /** Combined team kills that were needed to win (for "15 / 15" display). */
    target: number;
    /** Final scoreboard for everyone in the match (grouped by team client-side). */
    scores: MatchScore[];
  };
  [ServerMessage.Leaderboard]: {
    /** False when persistence is disabled (no DATABASE_URL) — show a notice. */
    enabled: boolean;
    /** Top entries, already ranked (best first). */
    entries: LeaderboardEntry[];
  };
  [ServerMessage.LevelUp]: { sessionId: string; level: number };
}
