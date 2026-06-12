import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  ARENA_ROOM,
  LOBBY_NAME_MAX_LENGTH,
  MAX_LOBBIES,
  READY_CHECK_MS,
  ClientMessage,
  ServerMessage,
  isCharacterClass,
  isLobbyMode,
  isTeam,
  teamSizeForMode,
  type LobbyMode,
  type Team,
} from '@arena/shared';
import { Lobby, LobbySlot, MatchmakingState } from './mmSchema.js';
import { verifyToken } from '../auth.js';
import {
  evictRoomDuplicates,
  registerSession,
  tagClientAccount,
  unregisterSession,
  SESSION_SUPERSEDED,
} from '../sessions.js';

/** Maximum accepted display-name length (mirrors the town/arena rooms). */
const MAX_NAME_LENGTH = 24;

/** The identity a player brings into matchmaking, carried through to the arena
 *  seat reservation when their lobby starts. */
interface Identity {
  token: string;
  name: string;
  characterClass: string;
  skinId: string;
  /** The tab/session key, carried into the arena seat reservation. */
  sessionKey: string;
}

/**
 * The singleton lobby/matchmaking room (Phase 12). It owns the replicated list
 * of lobbies — the browser, lobby detail, and ready-check are all driven by this
 * schema sync, so the client→server messages are pure intents
 * (create/join/leave/accept/decline). When a full lobby's ready-check passes it
 * spins up a private {@link ArenaRoom} and hands each participant a seat
 * reservation (the same `matchMaker.createRoom` + `reserveSeatFor` path the old
 * FIFO town queue used).
 *
 * Single-process / `LocalPresence` is assumed: every client `joinOrCreate`s this
 * handler and funnels into one instance, so the lobby list is globally shared.
 * Under multi-process you'd need a pinned room or a Redis-backed store.
 */
export class MatchmakingRoom extends Room<MatchmakingState> {
  /** Per-session identity, captured on join and used to issue reservations. */
  private readonly identities = new Map<string, Identity>();
  /** Which lobby each session currently occupies (at most one). */
  private readonly membership = new Map<string, string>();
  private lobbySeq = 0;
  /** Serializes async arena creation across all lobbies (one at a time). */
  private matching = false;
  /** Guards the arena-liveness poll so a slow query can't stack. */
  private polling = false;

  override onCreate(): void {
    this.autoDispose = false; // keep the lobby registry warm even when empty
    this.setState(new MatchmakingState());

    this.onMessage<{ name: string; mode: string }>(ClientMessage.CreateLobby, (client, message) =>
      this.handleCreate(client, message),
    );
    this.onMessage<{ lobbyId: string; team: string; index: number }>(
      ClientMessage.JoinSlot,
      (client, message) => this.handleJoinSlot(client, message),
    );
    this.onMessage(ClientMessage.LeaveLobby, (client) => {
      this.removePlayerFromLobby(client.sessionId);
    });
    this.onMessage(ClientMessage.AcceptMatch, (client) => this.handleAccept(client));
    this.onMessage(ClientMessage.DeclineMatch, (client) => {
      // Declining is leaving during the ready-check: the rest return to queuing.
      this.removePlayerFromLobby(client.sessionId);
    });

    // 1 Hz is plenty: drives ready-check timeout/retry and arena-liveness cleanup.
    this.setSimulationInterval(() => void this.tick(), 1000);
  }

  override onJoin(
    client: Client,
    options?: {
      token?: string;
      name?: string;
      characterClass?: string;
      skinId?: string;
      sessionKey?: string;
    },
  ): void {
    const claims = verifyToken(options?.token);
    const sessionKey = String(options?.sessionKey ?? '');
    // Single-session: a newer tab for this account supersedes the older one, and
    // a same-account reconnect into this room evicts its own stale ghost.
    if (claims?.pid !== undefined) {
      tagClientAccount(client, claims.pid);
      for (const stale of registerSession(claims.pid, sessionKey, client)) {
        stale.leave(SESSION_SUPERSEDED);
      }
      evictRoomDuplicates(this, claims.pid, client);
    }
    const name =
      claims?.name?.slice(0, MAX_NAME_LENGTH) ||
      (options?.name ?? '').trim().slice(0, MAX_NAME_LENGTH) ||
      'Adventurer';
    const characterClass = isCharacterClass(options?.characterClass)
      ? options.characterClass
      : 'warrior';
    this.identities.set(client.sessionId, {
      token: String(options?.token ?? ''),
      name,
      characterClass,
      skinId: String(options?.skinId ?? '').slice(0, 64),
      sessionKey,
    });
  }

  override onLeave(client: Client): void {
    this.removePlayerFromLobby(client.sessionId);
    this.identities.delete(client.sessionId);
    unregisterSession(client);
  }

  // --- Intents -----------------------------------------------------------

  private handleCreate(client: Client, message: { name?: string; mode?: string }): void {
    const identity = this.identities.get(client.sessionId);
    if (!identity) return;
    if (!isLobbyMode(message?.mode)) {
      this.fail(client, 'bad_mode', 'Pick a valid match size.');
      return;
    }
    const name = String(message?.name ?? '')
      .trim()
      .slice(0, LOBBY_NAME_MAX_LENGTH);
    if (name.length === 0) {
      this.fail(client, 'bad_name', 'Give your lobby a name.');
      return;
    }
    if (this.state.lobbies.size >= MAX_LOBBIES) {
      this.fail(client, 'too_many', 'Too many open lobbies right now. Try again shortly.');
      return;
    }

    // Auto-move: drop the player from any lobby they're already in.
    this.removePlayerFromLobby(client.sessionId);

    const mode: LobbyMode = message.mode;
    const size = teamSizeForMode(mode);
    const lobby = new Lobby();
    lobby.id = `lobby_${++this.lobbySeq}`;
    lobby.name = name;
    lobby.mode = mode;
    lobby.status = 'queuing';
    lobby.hostId = client.sessionId;
    for (let i = 0; i < size; i++) {
      lobby.blue.push(this.makeSlot('blue', i));
      lobby.red.push(this.makeSlot('red', i));
    }
    // Seat the creator into the first blue slot.
    this.seat(lobby.blue[0]!, client.sessionId, identity);
    this.membership.set(client.sessionId, lobby.id);
    this.state.lobbies.set(lobby.id, lobby);
  }

  private handleJoinSlot(
    client: Client,
    message: { lobbyId?: string; team?: string; index?: number },
  ): void {
    const identity = this.identities.get(client.sessionId);
    if (!identity) return;
    const lobby = this.state.lobbies.get(String(message?.lobbyId ?? ''));
    if (!lobby || lobby.status !== 'queuing') {
      this.fail(client, 'unavailable', 'That lobby is no longer open.');
      return;
    }
    if (!isTeam(message?.team)) return;
    const slots = message.team === 'red' ? lobby.red : lobby.blue;
    const index = Number(message?.index);
    const slot = Number.isInteger(index) ? slots[index] : undefined;
    if (!slot) return;
    if (slot.sessionId !== '') {
      this.fail(client, 'slot_taken', 'That slot was just taken.');
      return;
    }

    // Free whatever slot the player holds first. If it's in *this* lobby, just
    // clear it in place (a slot switch) so we never dispose the lobby mid-move.
    const current = this.membership.get(client.sessionId);
    if (current === lobby.id) {
      const own = this.findSlot(lobby, client.sessionId);
      if (own) this.clearSlot(own);
    } else if (current) {
      this.removePlayerFromLobby(client.sessionId);
    }

    this.seat(slot, client.sessionId, identity);
    this.membership.set(client.sessionId, lobby.id);

    if (this.isFull(lobby)) this.enterReadyCheck(lobby);
  }

  private handleAccept(client: Client): void {
    const lobbyId = this.membership.get(client.sessionId);
    if (!lobbyId) return;
    const lobby = this.state.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'ready_check') return;
    const slot = this.findSlot(lobby, client.sessionId);
    if (!slot) return;
    slot.accepted = true;
    if (this.allAccepted(lobby)) void this.startMatch(lobby);
  }

  // --- Lobby lifecycle ---------------------------------------------------

  private makeSlot(team: Team, index: number): LobbySlot {
    const slot = new LobbySlot();
    slot.team = team;
    slot.index = index;
    return slot;
  }

  private seat(slot: LobbySlot, sessionId: string, identity: Identity): void {
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

  private findSlot(lobby: Lobby, sessionId: string): LobbySlot | undefined {
    return (
      lobby.blue.find((s) => s.sessionId === sessionId) ??
      lobby.red.find((s) => s.sessionId === sessionId)
    );
  }

  /** Every slot in the lobby, blue then red (ArraySchema spreads as possibly
   *  undefined, so narrow to a clean array here). */
  private allSlots(lobby: Lobby): LobbySlot[] {
    return [...lobby.blue, ...lobby.red].filter((s): s is LobbySlot => s !== undefined);
  }

  private occupants(lobby: Lobby): LobbySlot[] {
    return this.allSlots(lobby).filter((s) => s.sessionId !== '');
  }

  private isFull(lobby: Lobby): boolean {
    return this.allSlots(lobby).every((s) => s.sessionId !== '');
  }

  private allAccepted(lobby: Lobby): boolean {
    return this.occupants(lobby).every((s) => s.accepted) && this.isFull(lobby);
  }

  private enterReadyCheck(lobby: Lobby): void {
    lobby.status = 'ready_check';
    lobby.readyDeadline = Date.now() + READY_CHECK_MS;
    for (const slot of this.occupants(lobby)) slot.accepted = false;
  }

  /** Return a lobby to the open state, clearing every accept (a ready-check was
   *  cancelled by a departure or timed out). */
  private resetToQueuing(lobby: Lobby): void {
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
  private removePlayerFromLobby(sessionId: string): void {
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

  // --- Match start + cleanup ---------------------------------------------

  /**
   * Create the arena and hand each participant a seat reservation. Gated on
   * `status === 'ready_check'` and serialized by `matching`, so the accept path
   * and the tick-driven backstop can't double-fire. Status flips to `playing`
   * synchronously before the awaited create, so a departing client's `onLeave`
   * (after it consumes the reservation) leaves the lobby's slots intact.
   */
  private async startMatch(lobby: Lobby): Promise<void> {
    if (this.matching || lobby.status !== 'ready_check') return;
    this.matching = true;
    lobby.status = 'playing';
    lobby.readyDeadline = 0;
    try {
      const room = await matchMaker.createRoom(ARENA_ROOM, { mode: lobby.mode });
      const seats: { sessionId: string; reservation: unknown }[] = [];
      for (const slot of this.occupants(lobby)) {
        const identity = this.identities.get(slot.sessionId);
        const reservation = await matchMaker.reserveSeatFor(room, {
          token: identity?.token ?? '',
          name: slot.name,
          characterClass: slot.characterClass,
          skinId: identity?.skinId ?? '',
          team: slot.team,
          sessionKey: identity?.sessionKey ?? '',
        });
        seats.push({ sessionId: slot.sessionId, reservation });
      }
      lobby.arenaRoomId = room.roomId;
      for (const seat of seats) {
        this.clientFor(seat.sessionId)?.send(ServerMessage.MatchFound, {
          reservation: seat.reservation,
        });
      }
    } catch (err) {
      console.error('[matchmaking] failed to start match:', err);
      lobby.status = 'queuing';
      lobby.arenaRoomId = '';
      for (const slot of this.occupants(lobby)) {
        slot.accepted = false;
        this.fail(this.clientFor(slot.sessionId), 'start_failed', 'Could not start the match.');
      }
    } finally {
      this.matching = false;
    }
  }

  /** Per-second housekeeping: expire stale ready-checks, retry a stalled start,
   *  and drop lobbies whose arena has ended. */
  private async tick(): Promise<void> {
    const now = Date.now();
    for (const lobby of this.state.lobbies.values()) {
      if (lobby.status !== 'ready_check') continue;
      if (this.allAccepted(lobby)) {
        // Everyone accepted but a concurrent start was in flight — retry.
        void this.startMatch(lobby);
      } else if (now > lobby.readyDeadline) {
        this.timeOutReadyCheck(lobby);
      }
    }
    await this.cleanupFinishedLobbies();
  }

  /** Ready-check timed out: kick everyone who didn't accept, return the rest to
   *  the open lobby (or dispose it if no one accepted). */
  private timeOutReadyCheck(lobby: Lobby): void {
    for (const slot of this.occupants(lobby)) {
      if (slot.accepted) continue;
      this.membership.delete(slot.sessionId);
      this.fail(this.clientFor(slot.sessionId), 'ready_timeout', 'You missed the ready-check.');
      this.clearSlot(slot);
    }
    const remaining = this.occupants(lobby);
    if (remaining.length === 0) {
      this.state.lobbies.delete(lobby.id);
      return;
    }
    if (!remaining.some((s) => s.sessionId === lobby.hostId)) {
      lobby.hostId = remaining[0]!.sessionId;
    }
    this.resetToQueuing(lobby);
  }

  /** Delete any `playing` lobby whose arena room no longer exists (the match
   *  ended and the room disposed after its results linger). */
  private async cleanupFinishedLobbies(): Promise<void> {
    if (this.polling) return;
    const playing = [...this.state.lobbies.values()].filter(
      (l) => l.status === 'playing' && l.arenaRoomId,
    );
    if (playing.length === 0) return;
    this.polling = true;
    try {
      for (const lobby of playing) {
        const rooms = await matchMaker.query({ roomId: lobby.arenaRoomId });
        if (rooms.length === 0) this.state.lobbies.delete(lobby.id);
      }
    } catch (err) {
      console.error('[matchmaking] arena cleanup query failed:', err);
    } finally {
      this.polling = false;
    }
  }

  // --- Helpers -----------------------------------------------------------

  private clientFor(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  private fail(client: Client | undefined, code: string, message: string): void {
    client?.send(ServerMessage.LobbyError, { code, message });
  }
}
