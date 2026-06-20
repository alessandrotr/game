import { READY_CHECK_MS, teamSizeForMode, type LobbyMode, type Team } from '@arena/shared';
import { Lobby, LobbySlot, type MatchmakingState } from '../mmSchema.js';

/** The identity a player brings into matchmaking, carried through to the arena
 *  seat reservation when their lobby starts. */
export interface Identity {
  token: string;
  name: string;
  characterClass: string;
  skinId: string;
  dyeId: string;
  pedestalId: string;
  titleId: string;
  rimId: string;
  weaponId: string;
  enchantId: string;
  /** The tab/session key, carried into the arena seat reservation. */
  sessionKey: string;
}

/**
 * The lobby state machine: per-session identities + membership, lobby creation,
 * slot seating/switching, ready-check transitions, and departure cleanup — every
 * mutation of the replicated {@link MatchmakingState}. The room drives it (and
 * owns the client messaging + the `matchMaker` arena handoff), keeping this purely
 * about lobby/slot bookkeeping.
 */
export class LobbyManager {
  /** Per-session identity, captured on join and used to issue reservations. */
  private readonly identities = new Map<string, Identity>();
  /** Which lobby each session currently occupies (at most one). */
  private readonly membership = new Map<string, string>();
  private lobbySeq = 0;

  constructor(private readonly state: MatchmakingState) {}

  // --- Identity ----------------------------------------------------------

  setIdentity(sessionId: string, identity: Identity): void {
    this.identities.set(sessionId, identity);
  }

  identityFor(sessionId: string): Identity | undefined {
    return this.identities.get(sessionId);
  }

  /** Drop a session entirely (its lobby presence and its identity). */
  remove(sessionId: string): void {
    this.removePlayerFromLobby(sessionId);
    this.identities.delete(sessionId);
  }

  // --- Queries -----------------------------------------------------------

  /** The lobby a session currently occupies, if any. */
  lobbyFor(sessionId: string): Lobby | undefined {
    const lobbyId = this.membership.get(sessionId);
    return lobbyId ? this.state.lobbies.get(lobbyId) : undefined;
  }

  findSlot(lobby: Lobby, sessionId: string): LobbySlot | undefined {
    return (
      lobby.blue.find((s) => s.sessionId === sessionId) ??
      lobby.red.find((s) => s.sessionId === sessionId)
    );
  }

  /** Every slot in the lobby, blue then red (ArraySchema spreads as possibly
   *  undefined, so narrow to a clean array here). */
  allSlots(lobby: Lobby): LobbySlot[] {
    return [...lobby.blue, ...lobby.red].filter((s): s is LobbySlot => s !== undefined);
  }

  occupants(lobby: Lobby): LobbySlot[] {
    return this.allSlots(lobby).filter((s) => s.sessionId !== '');
  }

  isFull(lobby: Lobby): boolean {
    return this.allSlots(lobby).every((s) => s.sessionId !== '');
  }

  allAccepted(lobby: Lobby): boolean {
    return this.occupants(lobby).every((s) => s.accepted) && this.isFull(lobby);
  }

  // --- Intents (the room validates + messages, then calls these) ---------

  /** Create a queuing lobby, seat the creator in the first blue slot, and add it
   *  to the replicated list. */
  createLobby(hostId: string, name: string, mode: LobbyMode): Lobby {
    const size = teamSizeForMode(mode);
    const lobby = new Lobby();
    lobby.id = `lobby_${++this.lobbySeq}`;
    lobby.name = name;
    lobby.mode = mode;
    lobby.status = 'queuing';
    lobby.hostId = hostId;
    for (let i = 0; i < size; i++) {
      lobby.blue.push(this.makeSlot('blue', i));
      lobby.red.push(this.makeSlot('red', i));
    }
    this.seat(lobby.blue[0]!, hostId);
    this.membership.set(hostId, lobby.id);
    this.state.lobbies.set(lobby.id, lobby);
    return lobby;
  }

  /** Seat a session into `slot`, first freeing whatever slot it already holds. A
   *  switch within the same lobby clears in place (so the lobby is never disposed
   *  mid-move); a move from another lobby goes through the normal departure. */
  joinSlot(sessionId: string, lobby: Lobby, slot: LobbySlot): void {
    const current = this.membership.get(sessionId);
    if (current === lobby.id) {
      const own = this.findSlot(lobby, sessionId);
      if (own) this.clearSlot(own);
    } else if (current) {
      this.removePlayerFromLobby(sessionId);
    }
    this.seat(slot, sessionId);
    this.membership.set(sessionId, lobby.id);
  }

  /** Mark a session's slot accepted; returns true once the whole lobby has. */
  accept(sessionId: string, lobby: Lobby): boolean {
    const slot = this.findSlot(lobby, sessionId);
    if (!slot) return false;
    slot.accepted = true;
    return this.allAccepted(lobby);
  }

  // --- Lifecycle transitions ---------------------------------------------

  enterReadyCheck(lobby: Lobby): void {
    lobby.status = 'ready_check';
    lobby.readyDeadline = Date.now() + READY_CHECK_MS;
    for (const slot of this.occupants(lobby)) slot.accepted = false;
  }

  /** Return a lobby to the open state, clearing every accept (a ready-check was
   *  cancelled by a departure or timed out). */
  resetToQueuing(lobby: Lobby): void {
    lobby.status = 'queuing';
    lobby.readyDeadline = 0;
    for (const slot of this.occupants(lobby)) slot.accepted = false;
  }

  /**
   * Remove a player from whatever lobby they occupy and clean up: dispose an
   * empty lobby, reassign the host, and cancel an in-progress ready-check (the
   * remaining players return to the open lobby). A no-op while the lobby is
   * already `playing` — those slots stay for the browser until the arena ends.
   */
  removePlayerFromLobby(sessionId: string): void {
    const lobbyId = this.membership.get(sessionId);
    if (!lobbyId) return;
    this.membership.delete(sessionId);
    const lobby = this.state.lobbies.get(lobbyId);
    if (!lobby || lobby.status === 'playing') return;

    const slot = this.findSlot(lobby, sessionId);
    if (slot) this.clearSlot(slot);

    if (this.occupants(lobby).length === 0) {
      this.state.lobbies.delete(lobbyId);
      return;
    }
    if (lobby.hostId === sessionId) {
      lobby.hostId = this.occupants(lobby)[0]?.sessionId ?? '';
    }
    if (lobby.status === 'ready_check') this.resetToQueuing(lobby);
  }

  /**
   * A ready-check timed out: kick everyone who didn't accept (returning their
   * session ids so the room can notify them), return the rest to the open lobby,
   * or dispose it if no one accepted.
   */
  timeOutReadyCheck(lobby: Lobby): string[] {
    const kicked: string[] = [];
    for (const slot of this.occupants(lobby)) {
      if (slot.accepted) continue;
      kicked.push(slot.sessionId);
      this.membership.delete(slot.sessionId);
      this.clearSlot(slot);
    }
    const remaining = this.occupants(lobby);
    if (remaining.length === 0) {
      this.state.lobbies.delete(lobby.id);
      return kicked;
    }
    if (!remaining.some((s) => s.sessionId === lobby.hostId)) {
      lobby.hostId = remaining[0]!.sessionId;
    }
    this.resetToQueuing(lobby);
    return kicked;
  }

  // --- Slot primitives ---------------------------------------------------

  private makeSlot(team: Team, index: number): LobbySlot {
    const slot = new LobbySlot();
    slot.team = team;
    slot.index = index;
    return slot;
  }

  private seat(slot: LobbySlot, sessionId: string): void {
    const identity = this.identities.get(sessionId);
    if (!identity) return;
    slot.sessionId = sessionId;
    slot.name = identity.name;
    slot.characterClass = identity.characterClass;
    slot.accepted = false;
  }

  private clearSlot(slot: LobbySlot): void {
    slot.sessionId = '';
    slot.name = '';
    slot.characterClass = 'warrior';
    slot.accepted = false;
  }
}
