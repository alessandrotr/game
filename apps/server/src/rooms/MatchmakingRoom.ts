import { matchMaker, type Client } from '@colyseus/core';
import {
  ARENA_ROOM,
  LOBBY_NAME_MAX_LENGTH,
  MAX_LOBBIES,
  ClientMessage,
  ServerMessage,
  isLobbyMode,
  isTeam,
} from '@arena/shared';
import { MatchmakingState, type Lobby } from './mmSchema.js';
import { BaseGameRoom } from './BaseGameRoom.js';
import {
  resolveClass,
  resolveName,
  resolveSkinId,
  sessionKeyOf,
  type JoinOptions,
} from './util/identity.js';
import { LobbyManager } from './matchmaking/lobbies.js';
import { captureServerError } from '../observability.js';

/**
 * The singleton lobby/matchmaking room (Phase 12). It owns the replicated list
 * of lobbies — the browser, lobby detail, and ready-check are all driven by this
 * schema sync, so the client→server messages are pure intents
 * (create/join/leave/accept/decline). When a full lobby's ready-check passes it
 * spins up a private {@link ArenaRoom} and hands each participant a seat
 * reservation. The lobby/slot bookkeeping lives in {@link LobbyManager}; this room
 * validates intents, messages clients, and drives the `matchMaker` arena handoff.
 *
 * Single-process / `LocalPresence` is assumed: every client `joinOrCreate`s this
 * handler and funnels into one instance, so the lobby list is globally shared.
 * Under multi-process you'd need a pinned room or a Redis-backed store.
 */
export class MatchmakingRoom extends BaseGameRoom<MatchmakingState> {
  private lobbies!: LobbyManager;
  /** Serializes async arena creation across all lobbies (one at a time). */
  private matching = false;
  /** Guards the arena-liveness poll so a slow query can't stack. */
  private polling = false;

  override onCreate(): void {
    this.autoDispose = false; // keep the lobby registry warm even when empty
    this.setState(new MatchmakingState());
    this.lobbies = new LobbyManager(this.state);

    this.onMessage<{ name: string; mode: string }>(ClientMessage.CreateLobby, (client, message) =>
      this.handleCreate(client, message),
    );
    this.onMessage<{ lobbyId: string; team: string; index: number }>(
      ClientMessage.JoinSlot,
      (client, message) => this.handleJoinSlot(client, message),
    );
    this.onMessage(ClientMessage.LeaveLobby, (client) => {
      this.lobbies.removePlayerFromLobby(client.sessionId);
    });
    this.onMessage(ClientMessage.AcceptMatch, (client) => this.handleAccept(client));
    this.onMessage(ClientMessage.DeclineMatch, (client) => {
      // Declining is leaving during the ready-check: the rest return to queuing.
      this.lobbies.removePlayerFromLobby(client.sessionId);
    });

    // 1 Hz is plenty: drives ready-check timeout/retry and arena-liveness cleanup.
    this.setSimulationInterval(() => void this.tick(), 1000);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    try {
      this.setupMatchmakingJoin(client, options);
    } catch (err) {
      captureServerError(err, {
        message: '[matchmaking] onJoin failed:',
        tags: { where: 'matchmaking.onJoin', roomId: this.roomId, sessionId: client.sessionId },
      });
      throw err; // re-throw so Colyseus rejects the seat (client sees a join error)
    }
  }

  private setupMatchmakingJoin(client: Client, options?: JoinOptions): void {
    const claims = this.enforceSingleSession(client, options);
    this.lobbies.setIdentity(client.sessionId, {
      token: String(options?.token ?? ''),
      name: resolveName(claims, options),
      characterClass: resolveClass(options),
      skinId: resolveSkinId(options),
      sessionKey: sessionKeyOf(options),
    });
  }

  /** Tear down a client's lobby presence. Idempotent — safe to run both when a
   *  duplicate session is evicted on join and again when the socket closes. */
  protected override removeClient(client: Client): void {
    this.lobbies.remove(client.sessionId);
    this.unregisterSession(client);
  }

  // --- Intents -----------------------------------------------------------

  private handleCreate(client: Client, message: { name?: string; mode?: string }): void {
    if (!this.lobbies.identityFor(client.sessionId)) return;
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
    this.lobbies.removePlayerFromLobby(client.sessionId);
    this.lobbies.createLobby(client.sessionId, name, message.mode);
  }

  private handleJoinSlot(
    client: Client,
    message: { lobbyId?: string; team?: string; index?: number },
  ): void {
    if (!this.lobbies.identityFor(client.sessionId)) return;
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

    this.lobbies.joinSlot(client.sessionId, lobby, slot);
    if (this.lobbies.isFull(lobby)) this.lobbies.enterReadyCheck(lobby);
  }

  private handleAccept(client: Client): void {
    const lobby = this.lobbies.lobbyFor(client.sessionId);
    if (!lobby || lobby.status !== 'ready_check') return;
    if (this.lobbies.accept(client.sessionId, lobby)) void this.startMatch(lobby);
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
      for (const slot of this.lobbies.occupants(lobby)) {
        const identity = this.lobbies.identityFor(slot.sessionId);
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
      captureServerError(err, {
        message: '[matchmaking] failed to start match:',
        tags: { where: 'matchmaking.startMatch', roomId: this.roomId },
        extra: { lobbyId: lobby.id, mode: lobby.mode },
      });
      lobby.status = 'queuing';
      lobby.arenaRoomId = '';
      for (const slot of this.lobbies.occupants(lobby)) {
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
      if (this.lobbies.allAccepted(lobby)) {
        // Everyone accepted but a concurrent start was in flight — retry.
        void this.startMatch(lobby);
      } else if (now > lobby.readyDeadline) {
        // Kick the non-acceptors and notify each.
        for (const sessionId of this.lobbies.timeOutReadyCheck(lobby)) {
          this.fail(this.clientFor(sessionId), 'ready_timeout', 'You missed the ready-check.');
        }
      }
    }
    await this.cleanupFinishedLobbies();
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
      captureServerError(err, {
        message: '[matchmaking] arena cleanup query failed:',
        tags: { where: 'matchmaking.cleanup', roomId: this.roomId },
      });
    } finally {
      this.polling = false;
    }
  }

  // --- Helpers -----------------------------------------------------------

  private fail(client: Client | undefined, code: string, message: string): void {
    client?.send(ServerMessage.LobbyError, { code, message });
  }
}
