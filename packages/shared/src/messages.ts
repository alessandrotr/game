/**
 * Strongly-typed message contracts exchanged over the Colyseus channel.
 *
 * Client → Server messages carry player intent; the server validates and applies
 * them authoritatively. Server → Client gameplay state is replicated via schema
 * sync, so explicit server messages are reserved for discrete events (casts,
 * damage) that drive transient client feedback.
 */

import type { AbilityConfig, AbilityKind } from './constants.js';

/** Message identifiers sent from client to server. */
export enum ClientMessage {
  /** Set/update the world-space point to move toward (hold-to-move). */
  MoveTo = 'move_to',
  /** Stop mouse-driven movement immediately (right mouse button released). */
  StopMove = 'stop_move',
  /** Request a jump; the server applies it only when grounded. */
  Jump = 'jump',
  /** Request to cast an ability in a direction. */
  CastAbility = 'cast_ability',
  /** Set or change the player's display name. */
  SetName = 'set_name',
  /** Dev-only: live-tune authoritative movement values for the room. */
  DevTune = 'dev_tune',
  /** Dev-only: live-tune authoritative ability balance values for the room. */
  AbilityTune = 'ability_tune',
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
}

/** Payload map for {@link ClientMessage}. */
export interface ClientMessagePayloads {
  [ClientMessage.MoveTo]: { x: number; z: number };
  [ClientMessage.StopMove]: Record<string, never>;
  [ClientMessage.Jump]: Record<string, never>;
  [ClientMessage.CastAbility]: { ability: AbilityKind; dirX: number; dirZ: number };
  [ClientMessage.SetName]: { name: string };
  [ClientMessage.DevTune]: {
    walkSpeed: number;
    sprintSpeed: number;
    jumpForce: number;
    sprintThreshold: number;
    stoppingDistance: number;
    rotationSpeed: number;
  };
  /** Per-ability balance overrides, in the server's own units (ms, world units). */
  [ClientMessage.AbilityTune]: Partial<Record<AbilityKind, Partial<AbilityConfig>>>;
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
  };
  [ServerMessage.Damage]: { from: string; to: string; amount: number; lethal: boolean };
  [ServerMessage.Heal]: { to: string; amount: number };
}
